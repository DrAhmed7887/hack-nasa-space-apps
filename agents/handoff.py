# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry; reviewed by the team.
"""Two real A2A agents (a2a-sdk 1.3.0, protocol 1.0) hand a VTE review packet from the spacecraft to the ground.

- onboard agent ("crew medical monitor"): gets a synthetic crew case and a destination, scores it with NASA's
  published method (vte.score), adds the scan schedule and the mission context (vte.missions), and sends the
  packet to the ground agent over A2A.
- ground agent ("flight surgeon desk"): receives the packet, stamps when it arrived on the simulated mission
  clock, and queues it for a human flight surgeon. It makes no clinical decision.
- runner (this script's main): plays every case at LEO, the Moon and Mars, and records every HTTP exchange.

The communication delay is SIMULATED on a mission clock (no sleeping), so the run is fast and repeatable.
Everything runs on 127.0.0.1, offline, no keys, no model calls. Usage: python agents/handoff.py site/replay.json
"""
from __future__ import annotations

import asyncio
import json
import socket
import sys
from datetime import datetime, timezone
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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from vte.missions import MISSIONS, review_context  # noqa: E402
from vte.packet import PACKET_PARTS, build_packet  # noqa: E402
from vte.sources import SOURCES  # noqa: E402

HOST = "127.0.0.1"
STARTUP_DEADLINE_S = 10.0
EXCHANGES: list[dict] = []
_current: dict = {}
BODY_CASE = "C05"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


def card(name: str, port: int, skill_id: str, description: str) -> AgentCard:
    return AgentCard(
        name=name,
        description=description,
        version="0.1.0",
        supported_interfaces=[
            AgentInterface(url=f"http://{HOST}:{port}/", protocol_binding="JSONRPC", protocol_version=PROTOCOL_VERSION_CURRENT)
        ],
        capabilities=AgentCapabilities(streaming=False),
        default_input_modes=["application/json"],
        default_output_modes=["application/json"],
        skills=[AgentSkill(id=skill_id, name=skill_id, description=description, tags=["vte", "synthetic"])],
    )


async def log_request(request: httpx.Request) -> None:
    body = request.content.decode() if request.content else ""
    EXCHANGES.append({**_current, "dir": "request", "method": request.method, "path": request.url.path,
                      "port_role": _role(request.url.port), "bytes": len(body), "body": body})


async def log_response(response: httpx.Response) -> None:
    await response.aread()
    EXCHANGES.append({**_current, "dir": "response", "path": response.request.url.path,
                      "port_role": _role(response.request.url.port), "status": response.status_code,
                      "bytes": len(response.text), "body": response.text})


PORT_ROLES: dict[int, str] = {}


def _role(port: int | None) -> str:
    return PORT_ROLES.get(port or 0, "unknown")


async def ask(url: str, payload: dict) -> dict:
    """Send one JSON payload (as A2A text) to the agent at `url` and return its JSON reply."""
    async with httpx.AsyncClient(event_hooks={"request": [log_request], "response": [log_response]}, timeout=10) as hc:
        client = await create_client(url, client_config=ClientConfig(streaming=False, httpx_client=hc))
        reply = ""
        async for event in client.send_message(SendMessageRequest(message=new_text_message(json.dumps(payload)))):
            if event.HasField("message"):
                reply = get_message_text(event.message)
            elif event.HasField("task"):
                for artifact in event.task.artifacts:
                    reply = " ".join(p.text for p in artifact.parts if p.text)
        return json.loads(reply)


async def deliver(ground_url: str, packet: dict) -> dict:
    """Hand the packet to the ground. If the ground cannot be reached, say so: the message the crew was shown does not depend on it."""
    try:
        return await ask(ground_url, packet)
    except Exception as exc:  # keep running: a failed hand-off must not stop the onboard side
        return {
            "from": "onboard-crew-medical-monitor",
            "case_id": packet["score"]["case_id"],
            "status": "Hand-off failed: ground not reached. Packet not delivered.",
            "delivered": False,
            "error": type(exc).__name__,
            "ground_decision": None,
            "note": "The message shown to the crew does not wait for the ground.",
        }


class Ground(AgentExecutor):
    """Flight surgeon desk: receives the packet and queues it for a human. No clinical decision."""

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        packet = json.loads(context.get_user_input())
        sent = packet["sent_at_mission_s"]
        delay = packet["review_context"]["simulated_one_way_delay_s"]
        ack = {
            "from": "ground-flight-surgeon-desk",
            "case_id": packet["score"]["case_id"],
            "received_at_mission_s": sent + delay,
            "reply_reaches_crew_at_mission_s": sent + 2 * delay,
            "status": "Queued for flight surgeon review",
            "delivered": True,
            "packet_parts_received": [k for k in PACKET_PARTS if k in packet],
            "ground_decision": None,
            "note": "The ground agent makes no clinical decision. A flight surgeon reviews the packet.",
        }
        await event_queue.enqueue_event(new_text_message(json.dumps(ack), context_id=context.context_id))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError


class Onboard(AgentExecutor):
    """Crew medical monitor: scores the case with NASA's method and hands the packet to the ground over A2A."""

    def __init__(self, ground_url: str) -> None:
        self.ground_url = ground_url

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        req = json.loads(context.get_user_input())
        packet = build_packet(req["case"], req["mission"])
        ack = await deliver(self.ground_url, packet)
        out = {"packet": packet, "ground_ack": ack}
        await event_queue.enqueue_event(new_text_message(json.dumps(out), context_id=context.context_id))

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError


def app(executor: AgentExecutor, agent_card: AgentCard) -> Starlette:
    handler = DefaultRequestHandler(agent_executor=executor, task_store=InMemoryTaskStore(), agent_card=agent_card)
    return Starlette(routes=create_agent_card_routes(agent_card) + create_jsonrpc_routes(handler, rpc_url="/"))


async def serve(server: uvicorn.Server) -> None:
    try:
        await server.serve()
    except SystemExit as exc:
        raise RuntimeError(f"agent server exited during start-up (code {exc.code})") from None


async def wait_started(servers: list[uvicorn.Server], tasks: list[asyncio.Task]) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + STARTUP_DEADLINE_S
    while not all(s.started for s in servers):
        if any(t.done() for t in tasks):
            raise RuntimeError("an agent server stopped during start-up (port in use?)")
        if loop.time() > deadline:
            raise RuntimeError(f"agent servers not up after {STARTUP_DEADLINE_S:.0f} s")
        await asyncio.sleep(0.05)


async def run(cases: list[dict]) -> tuple[list[dict], str]:
    ground_port, onboard_port = free_port(), free_port()
    PORT_ROLES.update({ground_port: "ground", onboard_port: "onboard"})
    ground_url, onboard_url = f"http://{HOST}:{ground_port}/", f"http://{HOST}:{onboard_port}/"
    servers = [
        uvicorn.Server(uvicorn.Config(app(Ground(), card("ground-flight-surgeon-desk", ground_port, "queue-vte-review",
                                                         "Receives VTE review packets and queues them for a flight surgeon")),
                                      HOST, ground_port, log_level="warning")),
        uvicorn.Server(uvicorn.Config(app(Onboard(ground_url), card("onboard-crew-medical-monitor", onboard_port, "score-vte-nasa",
                                                                    "Scores VTE risk with NASA's published method and sends it to the ground")),
                                      HOST, onboard_port, log_level="warning")),
    ]
    tasks = [asyncio.create_task(serve(s)) for s in servers]
    runs: list[dict] = []
    error = ""
    try:
        await wait_started(servers, tasks)
        for case in cases:
            for mission in MISSIONS:
                _current.clear()
                _current.update({"case_id": case["id"], "mission": mission})
                runs.append({"case_id": case["id"], "mission": mission, **await ask(onboard_url, {"case": case, "mission": mission})})
    except Exception as exc:  # keep the trace: a failed run is when it matters most
        error = f"{type(exc).__name__}: {exc}"
    finally:
        for s in servers:
            s.should_exit = True
        await asyncio.gather(*tasks, return_exceptions=True)
    return runs, error


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "runs/replay.json")
    doc_in = json.loads((ROOT / "data" / "crew_cases.json").read_text())
    runs, error = asyncio.run(run(doc_in["cases"]))
    a2a_calls = [e for e in EXCHANGES if e["dir"] == "request" and e["method"] == "POST"]
    for e in EXCHANGES:  # keep full JSON bodies for one example case; sizes for the rest keep the replay small
        if e.get("case_id") != BODY_CASE:
            e.pop("body", None)
    doc = {
        "_ai_assisted": "Recorded by agents/handoff.py (written with Claude Code). Synthetic cases only.",
        "what": "Replay of a recorded real run: two A2A agents on 127.0.0.1; mission delay simulated on a mission clock.",
        "recorded_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "a2a_sdk": "a2a-sdk 1.3.0 (A2A protocol 1.0)",
        "error": error,
        "sources": SOURCES,
        "missions": {k: review_context(k) for k in MISSIONS},
        "cases": doc_in["cases"],
        "runs": runs,
        "exchanges": EXCHANGES,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    ok = not error and len(runs) == len(doc_in["cases"]) * len(MISSIONS)
    print(f"runs: {len(runs)} | A2A message posts: {len(a2a_calls)} | error: {error or '-'} | wrote {out}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
