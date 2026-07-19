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
        # Some UFDR exports use attributes, some use sub-elements. We capture both.
        record = {'tag': child.tag.lower()}
        
        # Capture attributes
        for k, v in child.attrib.items():
            record[k.lower()] = str(v).strip()
            
        # Capture sub-elements
        for sub in child:
            if sub.text:
                record[sub.tag.lower()] = sub.text.strip()
                
        # If it has meaningful data (more than just the tag), append it
        if len(record) > 1:
            records.append(record)
            
    return records
