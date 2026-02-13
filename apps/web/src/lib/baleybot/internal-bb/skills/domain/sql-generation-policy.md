---
id: sql_generation_policy
version: 2
appliesTo: nl_to_sql_postgres,nl_to_sql_mysql
section: output_rules
---
Avoid destructive statements: DROP, TRUNCATE, ALTER, unrestricted DELETE.
Use dialect-specific syntax and include LIMIT 100 when the query is unconstrained.
