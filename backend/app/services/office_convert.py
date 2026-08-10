"""PPTX/PPT -> PDF conversion via headless LibreOffice, so slide decks can be rendered
through the same PdfReader.tsx used for real PDFs instead of the client-side JSZip
approximation (which only reconstructs text + images, not real slide layout).

Requires the `soffice` binary (package `libreoffice-impress`, installed in
backend/Dockerfile). Render's default *native* Python runtime cannot install it — this
only works once the service is switched to Render's Docker deploy type using that
Dockerfile. `is_conversion_available()` lets callers check first and skip conversion
entirely (not fail) on any environment — including local dev — where it isn't installed.
"""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# LibreOffice headless conversions are usually a few seconds for a typical slide deck, but
# large decks with many embedded images/videos can take longer. Capped so one stuck
# conversion can't hang an upload request forever.
CONVERSION_TIMEOUT_SECONDS = 90


def is_conversion_available() -> bool:
    return shutil.which('soffice') is not None or shutil.which('libreoffice') is not None


def convert_to_pdf(source_path: Path) -> Path | None:
    """Converts a .pptx/.ppt (or any LibreOffice-openable document) to PDF.

    Returns the path to the generated PDF, or None if conversion isn't available or fails —
    callers should treat that as "skip the conversion", not a hard error, since the original
    file upload must still succeed either way (see upload_materials in materials.py).

    The returned path lives in a fresh temp directory (`path.parent`) that the caller owns
    and must clean up (e.g. `shutil.rmtree(path.parent, ignore_errors=True)`) once it has
    read the bytes it needs.
    """
    binary = shutil.which('soffice') or shutil.which('libreoffice')
    if not binary:
        return None

    out_dir = Path(tempfile.mkdtemp(prefix='office_convert_'))
    try:
        result = subprocess.run(
            [
                binary,
                '--headless',
                '--norestore',
                '--convert-to', 'pdf',
                '--outdir', str(out_dir),
                str(source_path),
            ],
            capture_output=True,
            timeout=CONVERSION_TIMEOUT_SECONDS,
            check=False,
        )
        expected_output = out_dir / f'{source_path.stem}.pdf'
        if result.returncode != 0 or not expected_output.exists():
            logger.warning(
                'office_convert: conversion failed for %s (exit=%s): %s',
                source_path.name, result.returncode, result.stderr.decode(errors='replace')[:500],
            )
            return None
        return expected_output
    except subprocess.TimeoutExpired:
        logger.warning('office_convert: conversion timed out for %s', source_path.name)
        return None
    except Exception:
        logger.exception('office_convert: unexpected error converting %s', source_path.name)
        return None
