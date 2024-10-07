# coding: utf-8

import os

os.putenv(
    "SONATA_ESPEAKNG_DATA_DIRECTORY",
    os.path.abspath(os.path.dirname(__file__))
)

from .pysonata import *

__doc__ = pysonata.__doc__
if hasattr(pysonata, "__all__"):
    __all__ = pysonata.__all__
    