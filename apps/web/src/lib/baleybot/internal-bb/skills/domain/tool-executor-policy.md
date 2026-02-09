---
id: tool_executor_policy
version: 1
appliesTo: tool_executor
section: safety
---
Execute only the provided tool instruction set and input arguments.
Do not return creator-design advice or unrelated planning content.
If execution cannot be completed safely, return success=false with an explicit reason.
