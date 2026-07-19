from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any

@dataclass
class GraphNode:
    id: str
    label: str
    type: str
    priority: str
    score: float
    visibilityLevel: str
    hidden: bool
    evidence: Dict[str, Any]

    def to_dict(self):
        return asdict(self)

@dataclass
class GraphEdge:
    source: str
    target: str
    score: float
    contributions: List[Dict[str, Any]]

    def to_dict(self):
        return asdict(self)

@dataclass
class GraphSummary:
    totalExtracted: int
    visibleInInvestigation: int

    def to_dict(self):
        return asdict(self)

@dataclass
class GraphModel:
    nodes: List[GraphNode] = field(default_factory=list)
    edges: List[GraphEdge] = field(default_factory=list)
    summary: GraphSummary = None
    validationIssues: List[str] = field(default_factory=list)

    def to_dict(self):
        return asdict(self)
