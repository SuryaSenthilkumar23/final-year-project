import re
from urllib.parse import urlparse

PHONE_DIGITS_RE = re.compile(r'\d+')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
IP_RE = re.compile(r'^(?:\d{1,3}\.){3}\d{1,3}$')


def collapse_whitespace(value: object) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def normalize_phone(value: object) -> str | None:
    digits = ''.join(PHONE_DIGITS_RE.findall(str(value or '')))
    if not digits:
        return None
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10:
        digits = f'91{digits}'
    if len(digits) == 12 and digits.startswith('91'):
        return f'+{digits}'
    return None


def normalize_email(value: object) -> str | None:
    text = collapse_whitespace(value).lower()
    return text if EMAIL_RE.match(text) else None


def normalize_url(value: object) -> str | None:
    text = collapse_whitespace(value).lower()
    if not text:
        return None
    if '://' not in text:
        text = f'https://{text}'
    parsed = urlparse(text)
    if not parsed.netloc:
        return None
    host = parsed.netloc.lower()
    if host.startswith('www.'):
        host = host[4:]
    if host != 'localhost' and '.' not in host and not IP_RE.match(host):
        return None
    path = parsed.path.rstrip('/')
    return f'{host}{path}' if path else host


def normalize_location(value: object) -> str | None:
    text = collapse_whitespace(value).lower()
    if not text:
        return None
    text = re.sub(r'[^a-z0-9,\.\-\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip(' ,.') or None


def normalize_name(value: object) -> str | None:
    text = collapse_whitespace(value)
    if not text:
        return None
    text = re.sub(r'[^A-Za-z0-9\s\.\'-]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text.title() if text else None


def normalize_ip_address(value: object) -> str | None:
    text = collapse_whitespace(value)
    if not IP_RE.match(text):
        return None
    parts = text.split('.')
    if any(int(part) > 255 for part in parts):
        return None
    return '.'.join(str(int(part)) for part in parts)


def normalize_generic(value: object) -> str | None:
    text = collapse_whitespace(value).lower()
    return text or None
