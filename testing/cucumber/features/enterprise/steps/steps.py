"""
Re-export all step definitions so that `behave features/enterprise/` works
as a standalone run without needing to reference the parent steps directory.

When running the default suite (`behave` from testing/cucumber/), these
enterprise features are excluded via behave.ini.  When running enterprise
tests explicitly (`python -m behave features/enterprise`), Behave loads
steps only from this directory, so we import the parent implementations here.
"""

import os
import sys

# Make the parent steps/ directory importable
_parent_steps = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../steps"))
if _parent_steps not in sys.path:
    sys.path.insert(0, _parent_steps)

from step_definitions import *  # noqa: F401, F403
from auth_step_definitions import *  # noqa: F401, F403
from enterprise_step_definitions import *  # noqa: F401, F403
