WECA_WEIGHTS = {
    'shared_phone': 35,
    'shared_email': 25,
    'shared_gps': 15,
    'shared_contact': 0,
    'shared_message_thread': 10,
    'shared_call': 10,
    'shared_url': 5,
    'shared_device': 0,
    'shared_file': 0,
    'shared_image_metadata': 0,
    'shared_ip_address': 0,
    'shared_organization': 0,
}

PRIORITY_THRESHOLDS = {
    'high': 0.70,
    'medium': 0.40,
}

RELATIONSHIP_LABELS = {
    'shared_phone': 'Shared Phone Number',
    'shared_email': 'Shared Email',
    'shared_gps': 'Shared GPS',
    'shared_contact': 'Shared Contact',
    'shared_message_thread': 'Shared Message Thread',
    'shared_call': 'Shared Call',
    'shared_url': 'Shared URL',
    'shared_device': 'Shared Device',
    'shared_file': 'Shared File',
    'shared_image_metadata': 'Shared Image Metadata',
    'shared_ip_address': 'Shared IP Address',
    'shared_organization': 'Shared Organization',
}


def max_possible_weight() -> float:
    return float(sum(WECA_WEIGHTS.values()))

EVIDENCE_RELATIONSHIPS = {
    'phone': 'associated_with',
    'email': 'associated_with',
    'gps': 'located_at',
    'url': 'accessed',
    'ip_address': 'associated_with',
    'device': 'associated_with',
    'call': 'communicated_via',
    'message_thread': 'communicated_via',
    'file': 'associated_with',
    'image_metadata': 'associated_with',
    'organization': 'affiliated_with',
    'contact': 'associated_with',
    'other': 'associated_with',
}

EVIDENCE_RELATIONSHIP_LABELS = {
    'associated_with': 'Associated With',
    'located_at': 'Located At',
    'accessed': 'Accessed',
    'communicated_via': 'Communicated Via',
    'affiliated_with': 'Affiliated With',
}
