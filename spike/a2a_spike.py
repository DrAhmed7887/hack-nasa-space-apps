# AI-assisted: written with Claude Code (Anthropic). Feasibility spike only; no health logic.
"""A2A feasibility spike (a2a-sdk 1.3.0, spec 1.0): two local agents and a client.

- "counter" agent: replies with the word count of the text it gets.
- "relay" agent: receives text, calls the counter agent over A2A, and returns "relayed: <count>".
- client: discovers the relay agent from its agent card and sends one message.
Everything runs on 127.0.0.1, offline, no keys. Every HTTP request and response body is recorded to trace.json.
"""
from __future__ import annotations

import asyncio
import json
import socket
import sys
from pathlib import Path

import httpx
import uvicorn
from starlette.applications import Starlette

from a2a.client import ClientConfig, create_client
from a2a.helpers import get_message_text, new_text_message
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill, SendMessageRequest
from a2a.utils.constants import PROTOCOL_VERSION_CURRENT

HOST = "127.0.0.1"
STARTUP_DEADLINE_S = 10.0
TRACE: list[dict] = []


def free_port() -> int:
    """Ask the OS for a free local port (avoids clashes on reruns and shared runners)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


def card(name: str, port: int, skill: str) -> AgentCard:
    return AgentCard(
        name=name,
        description=f"Spike agent: {skill}",
        version="0.0.1",
        supported_interfaces=[
            AgentInterface(url=f"http://{HOST}:{port}/", protocol_binding="JSONRPC", protocol_version=PROTOCOL_VERSION_CURRENT)
        ],
        capabilities=AgentCapabilities(streaming=False),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        skills=[AgentSkill(id=skill, name=skill, description=skill, tags=["spike"])],
    )


async def log_request(request: httpx.Request) -> None:
    body = request.content.decode() if request.content else ""
    TRACE.append({"dir": "request", "method": request.method, "url": str(request.url), "body": body})


async def log_response(response: httpx.Response) -> None:
    await response.aread()
    TRACE.append({"dir": "response", "url": str(response.request.url), "status": response.status_code, "body": response.text})


def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(event_hooks={"request": [log_request], "response": [log_response]}, timeout=10)


async def ask(url: str, text: str) -> str:
    """Send one text message to the agent at `url` over A2A and return the reply text."""
    async with http_client() as hc:
        client = await create_client(url, client_config=ClientConfig(streaming=False, httpx_client=hc))
        reply = ""
        async for event in client.send_message(SendMessageRequest(message=new_text_message(text))):
            if event.HasField("message"):
                reply = get_message_text(event.message)
            elif event.HasField("task"):
                for artifact in event.task.artifacts:
                    reply = " ".join(p.text for p in artifact.parts if p.text)
        return reply


class Counter(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        words = len(context.get_user_input().split())
        await event_queue.enqueue_event(new_text_message(str(words), context_id=context.context_id))  # role: agent

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError  # spike: no cancellable work


class Relay(AgentExecutor):
    def __init__(self, counter_url: str) -> None:
        self.counter_url = counter_url

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        count = await ask(self.counter_url, context.get_user_input())
        await event_queue.enqueue_event(new_text_message(f"relayed: {count}", context_id=context.context_id))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError  # spike: no cancellable work


def app(executor: AgentExecutor, agent_card: AgentCard) -> Starlette:
    handler = DefaultRequestHandler(agent_executor=executor, task_store=InMemoryTaskStore(), agent_card=agent_card)
    return Starlette(routes=create_agent_card_routes(agent_card) + create_jsonrpc_routes(handler, rpc_url="/"))


async def serve(server: uvicorn.Server) -> None:
    """uvicorn calls sys.exit() when it can't bind; turn that into an ordinary error so main() can report it."""
    try:
        await server.serve()
    except SystemExit as exc:
        raise RuntimeError(f"agent server exited during start-up (code {exc.code})") from None


async def wait_started(servers: list[uvicorn.Server], tasks: list[asyncio.Task]) -> None:
    """Wait until every server listens; fail fast if one dies (e.g. port taken) or the deadline passes."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + STARTUP_DEADLINE_S
    while not all(s.started for s in servers):
        if any(t.done() for t in tasks):
            raise RuntimeError("an agent server stopped during start-up (port in use?)")
        if loop.time() > deadline:
            raise RuntimeError(f"agent servers not up after {STARTUP_DEADLINE_S:.0f} s")
        await asyncio.sleep(0.05)


async def main() -> int:
    counter_port, relay_port = free_port(), free_port()
    counter_url, relay_url = f"http://{HOST}:{counter_port}/", f"http://{HOST}:{relay_port}/"
    servers = [
        uvicorn.Server(uvicorn.Config(app(Counter(), card("counter", counter_port, "count-words")), HOST, counter_port, log_level="warning")),
        uvicorn.Server(uvicorn.Config(app(Relay(counter_url), card("relay", relay_port, "relay-to-counter")), HOST, relay_port, log_level="warning")),
    ]
    tasks = [asyncio.create_task(serve(s)) for s in servers]
    reply, error = "", ""
    try:
        await wait_started(servers, tasks)
        reply = await ask(relay_url, "one two three four")
    except Exception as exc:  # report and still write the trace: a failed run is when it matters most
        error = f"{type(exc).__name__}: {exc}"
    finally:
        for s in servers:
            s.should_exit = True
        await asyncio.gather(*tasks, return_exceptions=True)
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "runs/a2a_trace.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"_ai_assisted": "spike trace", "reply": reply, "error": error, "trace": TRACE}, indent=1))
    print("reply:", reply or "-", "| error:", error or "-", "| http exchanges:", len(TRACE) // 2, "| trace:", out)
    return 0 if reply == "relayed: 4" and not error else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
