import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

# Simple in-memory sliding-window limiter, keyed by (bucket name, client IP). This is
# intentionally not backed by Redis/Supabase — it's meant to blunt basic credential-stuffing
# and registration-spam scripts on a single-process deployment, not to be a hardened,
# distributed rate limiter. If this app ever runs with multiple worker processes/dynos,
# each process gets its own counters, so real capacity is effectively (limit * worker count);
# that's an acceptable tradeoff here since the goal is "stop naive scripted abuse," not
# perfect enforcement.
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def rate_limiter(bucket: str, max_requests: int, window_seconds: int):
    def _dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else 'unknown'
        key = (bucket, client_ip)
        now = time.monotonic()
        window = _hits[key]

        while window and now - window[0] > window_seconds:
            window.popleft()

        if len(window) >= max_requests:
            raise HTTPException(status_code=429, detail='Too many requests — please wait a moment and try again.')

        window.append(now)

    return _dependency
