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
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill, SendMessageRequest
from a2a.utils.constants import PROTOCOL_VERSION_CURRENT

HOST = "127.0.0.1"
COUNTER_PORT, RELAY_PORT = 8781, 8782
TRACE: list[dict] = []


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
        await event_queue.enqueue_event(new_text_message(str(words), context_id=context.context_id, role=2))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError


class Relay(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        count = await ask(f"http://{HOST}:{COUNTER_PORT}/", context.get_user_input())
        await event_queue.enqueue_event(new_text_message(f"relayed: {count}", context_id=context.context_id, role=2))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError


def app(executor: AgentExecutor, agent_card: AgentCard) -> Starlette:
    handler = DefaultRequestHandler(agent_executor=executor, task_store=InMemoryTaskStore(), agent_card=agent_card)
    return Starlette(routes=create_agent_card_routes(agent_card) + create_jsonrpc_routes(handler, rpc_url="/"))


async def main() -> int:
    servers = [
        uvicorn.Server(uvicorn.Config(app(Counter(), card("counter", COUNTER_PORT, "count-words")), HOST, COUNTER_PORT, log_level="warning")),
        uvicorn.Server(uvicorn.Config(app(Relay(), card("relay", RELAY_PORT, "relay-to-counter")), HOST, RELAY_PORT, log_level="warning")),
    ]
    tasks = [asyncio.create_task(s.serve()) for s in servers]
    while not all(s.started for s in servers):
        await asyncio.sleep(0.05)
    reply = await ask(f"http://{HOST}:{RELAY_PORT}/", "one two three four")
    for s in servers:
        s.should_exit = True
    await asyncio.gather(*tasks)
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "runs/a2a_trace.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"_ai_assisted": "spike trace", "reply": reply, "trace": TRACE}, indent=1))
    print("reply:", reply, "| http exchanges:", len(TRACE) // 2, "| trace:", out)
    return 0 if reply == "relayed: 4" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
