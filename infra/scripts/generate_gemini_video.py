import argparse
import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a video with Gemini/Veo and save as MP4.")
    parser.add_argument("--prompt", required=True, help="Prompt text for video generation")
    parser.add_argument("--output", required=True, help="Output MP4 path")
    parser.add_argument("--model", default=os.environ.get("GEMINI_VIDEO_MODEL", "veo-3.1-generate-preview"))
    parser.add_argument("--aspect-ratio", default=os.environ.get("GEMINI_VIDEO_ASPECT_RATIO", "9:16"))
    parser.add_argument("--resolution", default=os.environ.get("GEMINI_VIDEO_RESOLUTION", "720p"))
    parser.add_argument(
        "--duration-seconds",
        type=int,
        default=int(os.environ.get("GEMINI_VIDEO_DURATION_SECONDS", "8")),
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=int(os.environ.get("GEMINI_VIDEO_TIMEOUT_SECONDS", "900")),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Missing GEMINI_API_KEY (or GOOGLE_API_KEY).", file=sys.stderr)
        return 2

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = genai.Client(api_key=api_key)

    config_kwargs = {
        "aspect_ratio": args.aspect_ratio,
        "resolution": args.resolution,
    }
    if args.duration_seconds > 0:
        config_kwargs["duration_seconds"] = args.duration_seconds

    try:
        config = types.GenerateVideosConfig(**config_kwargs)
    except TypeError:
        # Some model/SDK combos may reject duration_seconds.
        config_kwargs.pop("duration_seconds", None)
        config = types.GenerateVideosConfig(**config_kwargs)

    print(f"Generating video with model={args.model}, aspect={args.aspect_ratio}, resolution={args.resolution}")
    operation = client.models.generate_videos(
        model=args.model,
        prompt=args.prompt,
        config=config,
    )

    started = time.time()
    while not operation.done:
        if time.time() - started > args.timeout_seconds:
            print("Timed out waiting for Gemini video generation.", file=sys.stderr)
            return 3
        print("Waiting for Gemini video generation to complete...")
        time.sleep(10)
        operation = client.operations.get(operation)

    response = getattr(operation, "response", None)
    generated_videos = getattr(response, "generated_videos", None) or []
    if not generated_videos:
        print("Gemini completed without generated video output.", file=sys.stderr)
        return 4

    generated_video = generated_videos[0]
    client.files.download(file=generated_video.video)
    generated_video.video.save(str(output_path))

    if not output_path.exists() or output_path.stat().st_size == 0:
        print("Generated video file missing or empty.", file=sys.stderr)
        return 5

    print(f"Saved generated video: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
