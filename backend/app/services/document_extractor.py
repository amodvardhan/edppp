"""Extract text from uploaded documents (PDF, DOCX, TXT)."""
import io
from pathlib import Path

from docx import Document
from pypdf import PdfReader


def extract_text_from_file(file_content: bytes, filename: str) -> str:
    """Extract plain text from PDF, DOCX, or TXT file."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(file_content)
    if ext == ".docx":
        return _extract_docx(file_content)
    if ext == ".doc":
        raise ValueError(
            "Legacy .doc format is not supported. Please save as .docx (Word 2007+) or export as PDF."
        )
    if ext == ".txt":
        return file_content.decode("utf-8", errors="replace")
    raise ValueError(f"Unsupported file type: {ext}. Use PDF, DOCX, or TXT.")


def _extract_pdf(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text)
    return "\n\n".join(parts) if parts else ""


def _extract_docx(content: bytes) -> str:
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
