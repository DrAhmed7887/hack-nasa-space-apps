"""Generate the film's voice lines and music bed with ElevenLabs.

AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry.
The voice and music it makes are AI-generated and labelled on screen.

Usage (from demo/video):
    pip install -r requirements.txt
    python scripts/elevenlabs_audio.py voice      # assets/voice/<id>.mp3 + <id>.align.json
    python scripts/elevenlabs_audio.py music      # assets/bgm/el_music.mp3 (git-ignored)

The key is read from ELEVENLABS_API_KEY, loaded from the repo's git-ignored .env.
It is never printed or written anywhere else.
"""
import base64
import json
import os
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv
from elevenlabs import ElevenLabs, VoiceSettings

HERE = Path(__file__).resolve().parent.parent  # demo/video
VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # George, pre-made narrator voice
VOICE_MODEL = "eleven_v4"
MUSIC_MODEL = "music_v2_5"
MUSIC_PROMPT = (
    "Minimal documentary science underscore, 95 bpm. A quiet low synth pulse and soft "
    "ticking for the first 11 seconds, tense but restrained; at 11 seconds a clean piano "
    "motif enters and the track opens into a calm, hopeful resolve; gentle ending at 29 "
    "seconds. Sits under a narrator: no lead melody fighting the voice, no drums hits, "
    "no vocals."
)


def client() -> ElevenLabs:
    load_dotenv(find_dotenv(usecwd=True) or str(HERE.parent.parent / ".env"))
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("ELEVENLABS_API_KEY is not set: run `npx -y @elevenlabs/cli@latest onboard init`")
    # The SDK reads the variable at import time, before .env loads, so pass it here.
    return ElevenLabs(api_key=key)


def words_from_alignment(al) -> list:
    """Character alignment -> word list with start/end seconds."""
    words, cur, start, end = [], "", None, None
    for ch, s, e in zip(al.characters, al.character_start_times_seconds, al.character_end_times_seconds):
        if ch.isspace():
            if cur:
                words.append({"text": cur, "start": round(start, 3), "end": round(end, 3)})
            cur, start = "", None
            continue
        if start is None:
            start = s
        cur, end = cur + ch, e
    if cur:
        words.append({"text": cur, "start": round(start, 3), "end": round(end, 3)})
    return words


def voice() -> None:
    req = json.loads((HERE / "audio_request.json").read_text())
    lines = req["lines"]
    out_dir = HERE / "assets" / "voice"
    out_dir.mkdir(parents=True, exist_ok=True)
    c = client()
    for i, line in enumerate(lines):
        res = c.text_to_speech.convert_with_timestamps(
            voice_id=VOICE_ID,
            model_id=VOICE_MODEL,
            text=line["text"],
            previous_text=lines[i - 1]["text"] if i else None,
            next_text=lines[i + 1]["text"] if i + 1 < len(lines) else None,
            voice_settings=VoiceSettings(stability=0.6, similarity_boost=0.75),
            output_format="mp3_44100_128",
        )
        (out_dir / f"{line['id']}.mp3").write_bytes(base64.b64decode(res.audio_base_64))
        al = res.normalized_alignment or res.alignment
        (out_dir / f"{line['id']}.align.json").write_text(
            json.dumps({"text": line["text"], "words": words_from_alignment(al)}, indent=1)
        )
        print(f"voice {line['id']}: ok")


def music() -> None:
    out = HERE / "assets" / "bgm" / "el_music.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    audio = client().music.compose(
        prompt=MUSIC_PROMPT, music_length_ms=30000, model_id=MUSIC_MODEL, force_instrumental=True
    )
    with open(out, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    print("music: ok")


if __name__ == "__main__":
    {"voice": voice, "music": music}[sys.argv[1]]()
