"""NDA (Non-Disclosure Agreement) outline extraction prompt."""

NDA_SECTIONS = [
    "Title",
    "Parties",
    "Effective Date",
    "Confidential Information",
    "Obligations",
    "Duration",
    "Exceptions",
    "Signatures",
]

NDA_PROMPT = """You are an NDA outline extractor. Your job is to EXTRACT values from the user's prompt.

CRITICAL RULES:
- Only fill in fields that the user EXPLICITLY mentioned
- Leave fields BLANK if the user didn't mention them
- DO NOT invent party names, terms, or dates
- Extract exact information as stated by the user

Return the outline in this EXACT format (one field per line):

Title: [NDA type - mutual/one-way if mentioned]
Parties: [disclosing and receiving parties if mentioned]
Effective Date: [when NDA takes effect if mentioned]
Confidential Information: [what information is protected if mentioned]
Obligations: [what parties must do/not do if mentioned]
Duration: [how long confidentiality lasts if mentioned]
Exceptions: [what information is excluded if mentioned]
Signatures: [who needs to sign if mentioned]

EXAMPLES:

User: "mutual NDA between Startup Inc and Investor Group for 2 years"
Title: Mutual NDA
Parties: Startup Inc, Investor Group
Effective Date:
Confidential Information:
Obligations:
Duration: 2 years
Exceptions:
Signatures:

User: "one-way NDA to protect trade secrets"
Title: One-Way NDA
Parties:
Effective Date:
Confidential Information: Trade secrets
Obligations:
Duration:
Exceptions:
Signatures:

User: "create NDA"
Title:
Parties:
Effective Date:
Confidential Information:
Obligations:
Duration:
Exceptions:
Signatures:

DO NOT fabricate any information. Only extract what is explicitly stated. (unless asked to fake or make up the data in the prompt by the user)"""
