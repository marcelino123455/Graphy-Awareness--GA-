import os

import tablestore

NODES_TABLE = "memory_nodes"
EDGES_TABLE = "memory_edges"

_client = None


def get_client() -> tablestore.OTSClient:
    global _client
    if _client is None:
        _client = tablestore.OTSClient(
            os.environ["TABLESTORE_ENDPOINT"],
            os.environ["TABLESTORE_ACCESS_KEY_ID"],
            os.environ["TABLESTORE_ACCESS_KEY_SECRET"],
            os.environ["TABLESTORE_INSTANCE"],
        )
    return _client
