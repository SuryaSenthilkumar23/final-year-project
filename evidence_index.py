from collections import defaultdict
from typing import Dict, DefaultDict
from investigation_builder import InvestigationPerson, EvidenceMetadata

class EvidenceIndex:
    def __init__(self, investigations: dict[str, InvestigationPerson]):
        self.phones: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.emails: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.devices: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.gps: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.messages: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.calls: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.urls: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.ips: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        self.files: DefaultDict[str, Dict[str, EvidenceMetadata]] = defaultdict(dict)
        
        self._build_index(investigations)
        
    def _build_index(self, investigations: dict[str, InvestigationPerson]):
        for person_id, person in investigations.items():
            for val, meta in person.phones.items(): self.phones[val][person_id] = meta
            for val, meta in person.emails.items(): self.emails[val][person_id] = meta
            for val, meta in person.devices.items(): self.devices[val][person_id] = meta
            for val, meta in person.locations.items(): self.gps[val][person_id] = meta
            for val, meta in person.messages.items(): self.messages[val][person_id] = meta
            for val, meta in person.calls.items(): self.calls[val][person_id] = meta
            for val, meta in person.urls.items(): self.urls[val][person_id] = meta
            for val, meta in person.ip_addresses.items(): self.ips[val][person_id] = meta
            for val, meta in person.files.items(): self.files[val][person_id] = meta
