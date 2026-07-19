from dataclasses import dataclass, field
from typing import Dict, List, Any

@dataclass
class TimelineEvent:
    id: str
    timestamp: str
    person: str
    source: str
    category: str
    description: str
    metadata: dict = field(default_factory=dict)

@dataclass
class EvidenceMetadata:
    value: str
    source: str
    confidence: float

@dataclass
class InvestigationPerson:
    id: str
    name: str
    phones: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    emails: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    locations: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    calls: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    messages: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    urls: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    devices: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    ip_addresses: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    files: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    images: Dict[str, EvidenceMetadata] = field(default_factory=dict)
    timeline: List[TimelineEvent] = field(default_factory=list)

def build_investigation(raw_records) -> dict[str, InvestigationPerson]:
    investigations = {}
    
    event_counter = 0
    
    for record in raw_records:
        if 'owner' in record:
            name = record['owner']
        elif record.get('tag', '').lower() in ['contact', 'person']:
            name = record.get('name', 'Unknown')
        else:
            name = 'Unknown'
            
        name = name.strip().title()
        person_id = name.lower().replace(" ", "_")
        
        if person_id not in investigations:
            investigations[person_id] = InvestigationPerson(id=person_id, name=name)
            
        person = investigations[person_id]
        
        # Source and confidence logic
        # If it's explicitly assigned via owner metadata, it's high confidence.
        # Otherwise, fallback to source defaults.
        source = record.get('source_file', 'unknown')
        confidence = 1.0 if 'owner' in record else 0.8
        
        def add_evidence(collection: Dict[str, EvidenceMetadata], value: str):
            if value and value not in collection:
                collection[value] = EvidenceMetadata(value=value, source=source, confidence=confidence)

        if 'phone' in record: add_evidence(person.phones, record['phone'])
        if 'email' in record: add_evidence(person.emails, record['email'])
        if 'location' in record or 'gps' in record: add_evidence(person.locations, record.get('location', record.get('gps')))
        if 'url' in record: add_evidence(person.urls, record['url'])
        if 'device' in record: add_evidence(person.devices, record['device'])
        if 'ip' in record: add_evidence(person.ip_addresses, record['ip'])
        if 'file' in record or 'document' in record: add_evidence(person.files, record.get('file', record.get('document')))
        
        if 'timestamp' in record:
            event_counter += 1
            person.timeline.append(TimelineEvent(
                id=f"evt_{person_id}_{event_counter}",
                timestamp=record['timestamp'],
                person=name,
                source=source,
                category=record.get('tag', 'unknown'),
                description=f"Recorded {record.get('tag', 'unknown')} event",
                metadata=record
            ))
            
    return investigations
