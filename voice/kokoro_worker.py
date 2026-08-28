import base64
import io
import json
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline


pipelines = {}


def pipeline_for(voice):
    language = "b" if voice.startswith("b") else "a"
    if language not in pipelines:
        pipelines[language] = KPipeline(lang_code=language, repo_id="hexgrad/Kokoro-82M")
    return pipelines[language]


def synthesize(text, voice, speed):
    chunks = []
    for _, _, audio in pipeline_for(voice)(text, voice=voice, speed=speed, split_pattern=r"\n+"):
        chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        raise RuntimeError("Kokoro produced no audio")
    audio = np.concatenate(chunks)
    output = io.BytesIO()
    sf.write(output, audio, 24000, format="WAV", subtype="PCM_16")
    return {
        "audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
        "mimeType": "audio/wav",
        "durationSeconds": round(len(audio) / 24000, 3),
    }


for line in sys.stdin:
    try:
        request = json.loads(line)
        text = str(request.get("text", "")).strip()[:5000]
        if not text:
            raise ValueError("Text is required")
        result = synthesize(text, request.get("voice", "af_heart"), float(request.get("speed", 1.0)))
        response = {"id": request.get("id"), "result": result}
    except Exception as error:
        response = {"id": request.get("id") if "request" in locals() else None, "error": str(error)}
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()
