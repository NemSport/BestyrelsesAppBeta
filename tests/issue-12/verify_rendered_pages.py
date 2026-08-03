from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def page_number(path: Path) -> int:
    return int(path.stem.rsplit("-", 1)[-1])


def verify_and_build_contact_sheets(render_root: Path) -> dict[str, object]:
    metrics: dict[str, object] = {}
    contact_root = render_root.parent / "contact-sheets"
    contact_root.mkdir(parents=True, exist_ok=True)

    for pdf_directory in sorted(path for path in render_root.iterdir() if path.is_dir()):
        pages = sorted(pdf_directory.glob("*.png"), key=page_number)
        if not pages:
            raise AssertionError(f"No rendered pages in {pdf_directory}")

        page_metrics: list[dict[str, object]] = []
        thumbnails: list[Image.Image] = []
        expected_size: tuple[int, int] | None = None
        for index, page_path in enumerate(pages, start=1):
            with Image.open(page_path) as source:
                image = source.convert("RGB")
            expected_size = expected_size or image.size
            if image.size != expected_size:
                raise AssertionError(
                    f"Inconsistent page size in {pdf_directory.name}: {page_path.name}"
                )

            gray = ImageOps.grayscale(image)
            ink = gray.point(lambda value: 255 if value < 245 else 0)
            bounds = ink.getbbox()
            if bounds is None:
                raise AssertionError(f"Blank page: {page_path}")

            width, height = image.size
            bottom_edge = gray.crop((0, height - 8, width, height))
            if bottom_edge.getextrema()[0] < 220:
                raise AssertionError(f"Content reaches bottom edge: {page_path}")

            page_metrics.append(
                {
                    "page": index,
                    "size": [width, height],
                    "ink_bounds": list(bounds),
                    "ink_pixels": sum(gray.histogram()[:220]),
                }
            )

            thumbnail = image.copy()
            thumbnail.thumbnail((220, 310))
            card = Image.new("RGB", (240, 345), "white")
            card.paste(thumbnail, ((240 - thumbnail.width) // 2, 22))
            draw = ImageDraw.Draw(card)
            draw.text((8, 5), f"{pdf_directory.name} - side {index}", fill="black")
            thumbnails.append(card)

        columns = 4
        rows = (len(thumbnails) + columns - 1) // columns
        sheet = Image.new("RGB", (columns * 240, rows * 345), "#d9d9d9")
        for index, thumbnail in enumerate(thumbnails):
            sheet.paste(thumbnail, ((index % columns) * 240, (index // columns) * 345))
        sheet.save(contact_root / f"{pdf_directory.name}.png", optimize=True)
        metrics[pdf_directory.name] = {
            "page_count": len(pages),
            "pages": page_metrics,
        }

    metrics_path = render_root.parent / "render-metrics.json"
    metrics_path.write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return metrics


if __name__ == "__main__":
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "tmp/pdfs/issue-12/rendered")
    result = verify_and_build_contact_sheets(root.resolve())
    print(json.dumps({name: item["page_count"] for name, item in result.items()}))
