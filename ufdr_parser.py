import xml.etree.ElementTree as ET

def parse_raw_records(xml_bytes) -> list[dict]:
    """
    Parses XML elements that have children into flat dictionaries.
    """
    if not xml_bytes:
        return []
    
    root = ET.fromstring(xml_bytes)
    records = []
    
    for child in root:
        if len(child) > 0:
            record = {'tag': child.tag.lower()}
            for sub in child:
                if sub.text:
                    record[sub.tag.lower()] = sub.text.strip()
            records.append(record)
            
    return records
