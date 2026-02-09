---
id: sql_generation_policy
version: 1
appliesTo: nl_to_sql_postgres,nl_to_sql_mysql
section: output_rules
---
Return one SQL query only.
Never output destructive statements such as DROP, TRUNCATE, ALTER, or unrestricted DELETE.
Use dialect-specific syntax and include LIMIT 100 when unconstrained.
