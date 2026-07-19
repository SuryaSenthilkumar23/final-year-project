from entity_normalizer import (
    normalize_phone, normalize_email, normalize_url, normalize_location,
    normalize_name, normalize_ip_address, normalize_generic
)

def normalize_investigations(investigations: dict) -> dict:
    """
    Applies strict formatting rules to all extracted evidence to canonicalize values
    before they reach the Evidence Index. This prevents false negatives where '+919876543210' 
    and '9876543210' are treated as separate entities.
    """
    for person_id, person in investigations.items():
        # Clean person name
        clean_name = normalize_name(person.name)
        if clean_name:
            person.name = clean_name
            
        def _normalize_dict(evidence_dict, normalizer_func):
            new_dict = {}
            for raw_val, metadata in evidence_dict.items():
                norm_val = normalizer_func(raw_val)
                if norm_val:
                    # Maintain metadata (source, confidence)
                    metadata.value = norm_val
                    new_dict[norm_val] = metadata
            return new_dict

        person.phones = _normalize_dict(person.phones, normalize_phone)
        person.emails = _normalize_dict(person.emails, normalize_email)
        person.urls = _normalize_dict(person.urls, normalize_url)
        person.locations = _normalize_dict(person.locations, normalize_location)
        person.ip_addresses = _normalize_dict(person.ip_addresses, normalize_ip_address)
        
        person.devices = _normalize_dict(person.devices, normalize_generic)
        person.calls = _normalize_dict(person.calls, normalize_generic)
        person.messages = _normalize_dict(person.messages, normalize_generic)
        person.files = _normalize_dict(person.files, normalize_generic)
        person.images = _normalize_dict(person.images, normalize_generic)

    return investigations
