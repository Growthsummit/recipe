"""Part C.1 and C.3 - data classification and GDPR compliance workbook (+ JSON for the admin console)."""
import json
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

CLASSIFICATION = [
 ("D01","Recipe catalogue (titles, ingredients, instructions, photographs)","Static app bundle (src/data/recipes.js, public/images)","No","Public","Published content intended for everyone; no personal data.","Integrity of the bundle (HTTPS, build hashing).","All actors (read); Admin (write)"),
 ("D02","Recipe ratings, cooking time, difficulty","Static app bundle","No","Public","Descriptive catalogue attributes shown to all visitors.","Change control on the data file.","All actors (read); Admin (write)"),
 ("D03","Search text typed by the user","Browser memory only (React state)","Yes - may reveal preferences","Private","Not stored or transmitted; could reveal dietary or personal interests if logged.","Do not log or send to third parties.","The user"),
 ("D04","Favourites list (recipe IDs)","Browser localStorage (recipebox.favourites)","Yes - linked to a device/person","Private","Reveals a person's tastes; only the owner needs it.","Write limited to User role; clear on logout/shared devices.","User (read/write)"),
 ("D05","Profile display name ('Relebohile')","Hard-coded in the profile screen","Yes","Private","Directly identifies a person.","Collect only with a lawful basis; never place on the ledger.","User (read/write)"),
 ("D06","Notification preferences","Not implemented in the app ('No Notifications yet!!')","Yes - if introduced","Private","Would describe a user's contact preferences.","Opt-in consent before any notification is sent.","User"),
 ("D07","Active role / actor selection","Browser localStorage (recipebox.actor)","No","Private","Controls what the interface shows; not sensitive alone but not for public display.","Replace with server-issued session/token in production.","Security Admin"),
 ("D08","Blockchain ledger records (event type, recipe ID, pseudonymous actor ID, timestamp, hashes)","Browser localStorage (recipebox.nodes), 3 simulated nodes","Pseudonymised","Confidential","Immutable behavioural records; pseudonymised personal data under GDPR; integrity is business-critical.","Hash-chain + consensus; read for Analyst/Admin only; no names on chain.","Analyst, Admin (read)"),
 ("D09","Pseudonymisation salt","Browser localStorage (recipebox.salt)","Yes - enables re-identification","Restricted","Whoever holds the salt can link pseudonyms back to the actor.","Never exported; server-side secret store in production; rotate on erasure request.","Security Admin only"),
 ("D10","Access-control policy (role x module read/write matrix)","Browser localStorage (recipebox.policy)","No","Restricted","Tampering allows privilege escalation across the whole application.","Editable only through the Security Configuration module (Admin domain); audit every change.","Security Admin only"),
 ("D11","Access-denied / audit events","Blockchain ledger (type ACCESS_DENIED)","Pseudonymised","Confidential","Security-relevant evidence; may expose attack patterns.","Append-only; Analyst/Admin read.","Analyst, Admin (read)"),
 ("D12","AI interaction dataset (users, impressions, favourites)","ml/data/recipebox_interactions.csv","Simulated now; Yes with real users","Confidential","Behavioural data about people if real users replace the simulation.","Anonymise/aggregate before sharing; restrict raw rows to Analyst.","Data Analyst"),
 ("D13","AI model outputs (metrics, recommendations)","public/ai/metrics.json","No (aggregated)","Private","Internal analytics; aggregated, but not meant for the public.","Serve only to roles with AI Dashboards read access.","Analyst, Admin"),
 ("D14","Authentication credentials / tokens (future)","Not implemented","Yes","Restricted","Would grant account access if the app adds sign-in.","Hash passwords, short-lived tokens, MFA.","Security Admin only"),
]

# status: Compliant / Partially compliant / Non-compliant / Not applicable
GDPR = [
 ("Art. 5(1)(a)","Lawfulness, fairness and transparency","Tell people what is processed and why.","Partially compliant","Data use is simple, but the Figma design has no privacy notice.","Add a privacy notice reachable from About RecipeBox."),
 ("Art. 5(1)(b)","Purpose limitation","Use data only for the stated purpose.","Compliant","Favourites and events are used only for saved recipes, integrity and recommendations.","Keep purposes documented when features grow."),
 ("Art. 5(1)(c)","Data minimisation","Collect only what is needed.","Compliant","No registration, no backend; the ledger stores only event type, recipe ID and a pseudonym.","-"),
 ("Art. 5(1)(d)","Accuracy","Keep personal data accurate.","Partially compliant","Profile name is fixed text and cannot be corrected by the user.","Allow editing the display name."),
 ("Art. 5(1)(e)","Storage limitation","Do not keep data longer than necessary.","Partially compliant","localStorage has no expiry; ledger blocks are permanent.","Add retention periods and a 'clear my data' action."),
 ("Art. 5(1)(f)","Integrity and confidentiality","Protect against tampering and unauthorised access.","Partially compliant","Hash-chained ledger detects tampering and RBAC limits modules, but enforcement is client-side and data is not encrypted at rest.","Enforce RBAC on a server; encrypt sensitive stores."),
 ("Art. 6","Lawful basis","Have a lawful basis for processing.","Partially compliant","Processing is limited to features the user asks for, but the basis is not recorded.","Document the basis (consent or legitimate interest)."),
 ("Art. 7","Conditions for consent","Consent must be explicit, informed and withdrawable.","Non-compliant","No consent mechanism exists (not in the design).","Add consent before any non-essential processing (e.g. analytics)."),
 ("Art. 12-14","Information to data subjects","Provide clear privacy information.","Non-compliant","No privacy policy screen.","Publish a privacy policy."),
 ("Art. 15","Right of access","Let people see their data.","Partially compliant","Favourites are visible in the Favourites screen; no full export.","Provide a 'view my data' summary."),
 ("Art. 16","Right to rectification","Let people correct their data.","Non-compliant","Display name cannot be changed.","Add profile editing."),
 ("Art. 17","Right to erasure","Let people delete their data.","Partially compliant","Favourites can be removed; ledger entries cannot be deleted, but hold only pseudonymous IDs (rotating the salt unlinks them).","Add a 'delete my data' action that clears storage and rotates the salt."),
 ("Art. 20","Data portability","Provide data in a machine-readable format.","Non-compliant","No export function.","Add JSON export of favourites."),
 ("Art. 21","Right to object (profiling)","Allow objection to profiling.","Not applicable","The model is trained on simulated data only.","Re-assess before training on real user data."),
 ("Art. 22","Automated decision-making","No solely automated decisions with significant effects.","Not applicable","Recommendations have no legal or similar effect.","-"),
 ("Art. 25","Data protection by design and default","Build privacy into the design.","Compliant","Minimal data, local-only storage, pseudonymisation on the ledger, role-based access.","-"),
 ("Art. 30","Records of processing","Maintain a record of processing activities.","Partially compliant","The Data Classification sheet works as a register but lacks controller details.","Add controller/contact and retention columns."),
 ("Art. 32","Security of processing","Appropriate technical and organisational measures.","Partially compliant","Integrity and access controls exist; no authentication, no encryption at rest.","Add authentication and encryption."),
 ("Art. 33-34","Breach notification","Notify authority within 72 hours.","Non-compliant","No incident-response procedure.","Write a breach-response plan."),
 ("Art. 35","Data protection impact assessment","DPIA for high-risk processing.","Not applicable","No real personal data is processed yet.","Perform a DPIA before launch with real users."),
 ("Art. 44-49","International transfers","Safeguard transfers outside the EEA.","Partially compliant","No app data leaves the device, but Inter is loaded from Google Fonts, which sends visitors' IP addresses to Google.","Self-host the Inter font files."),
]

NAVY = "5A3825"; CREAM = "F8F1E7"
head_font = Font(bold=True, color="FFFFFF"); head_fill = PatternFill("solid", fgColor=NAVY)
thin = Side(style="thin", color="E4D7C9"); border = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")

def header(ws, row, titles):
    for i, t in enumerate(titles, 1):
        c = ws.cell(row=row, column=i, value=t); c.font = head_font; c.fill = head_fill; c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = border

wb = Workbook()
ws = wb.active; ws.title = "Data Classification"
ws["A1"] = "RecipeBox - Data Classification Register"; ws["A1"].font = Font(bold=True, size=14, color=NAVY)
ws["A2"] = "Levels: Public (anyone), Private (owner only), Confidential (restricted business/security need), Restricted (highest impact if exposed)."
header(ws, 4, ["ID","Data element","Where stored / processed","Personal data?","Classification","Rationale","Required controls","Who may access"])
for r, row in enumerate(CLASSIFICATION, 5):
    for c, v in enumerate(row, 1):
        cell = ws.cell(row=r, column=c, value=v); cell.alignment = wrap; cell.border = border
last = 4 + len(CLASSIFICATION)
dv = DataValidation(type="list", formula1='"Public,Private,Confidential,Restricted"', allow_blank=False); ws.add_data_validation(dv); dv.add(f"E5:E{last}")
colors = {"Public":"E2EFDA","Private":"FFF2CC","Confidential":"FCE4D6","Restricted":"F4B6B6"}
for r in range(5, last + 1):
    ws.cell(row=r, column=5).fill = PatternFill("solid", fgColor=colors[ws.cell(row=r, column=5).value]); ws.cell(row=r, column=5).font = Font(bold=True)
for col, w in zip("ABCDEFGH", [7, 42, 36, 22, 15, 44, 44, 26]): ws.column_dimensions[col].width = w
ws.freeze_panes = "A5"
s = last + 3
ws.cell(row=s, column=2, value="Summary (formulas)").font = Font(bold=True, color=NAVY)
for i, lvl in enumerate(["Public", "Private", "Confidential", "Restricted"], 1):
    ws.cell(row=s + i, column=2, value=lvl)
    ws.cell(row=s + i, column=3, value=f'=COUNTIF($E$5:$E${last},B{s+i})')
ws.cell(row=s + 5, column=2, value="Total elements").font = Font(bold=True)
ws.cell(row=s + 5, column=3, value=f"=SUM(C{s+1}:C{s+4})").font = Font(bold=True)

g = wb.create_sheet("GDPR Compliance")
g["A1"] = "RecipeBox - GDPR Compliance Self-Assessment"; g["A1"].font = Font(bold=True, size=14, color=NAVY)
g["A2"] = "A self-assessment of the current prototype, not legal advice. Change column D (drop-down) and the score updates."
header(g, 4, ["Article","Principle / right","Requirement","Status","Evidence in the application","Gap / action","Score"])
dv2 = DataValidation(type="list", formula1='"Compliant,Partially compliant,Non-compliant,Not applicable"', allow_blank=False); g.add_data_validation(dv2)
gl = 4 + len(GDPR)
for r, (art, pr, req, st, ev, act) in enumerate(GDPR, 5):
    for c, v in enumerate([art, pr, req, st, ev, act], 1):
        cell = g.cell(row=r, column=c, value=v); cell.alignment = wrap; cell.border = border
    dv2.add(f"D{r}")
    g.cell(row=r, column=7, value=f'=IF(D{r}="Compliant",1,IF(D{r}="Partially compliant",0.5,IF(D{r}="Non-compliant",0,"")))').border = border
for col, w in zip("ABCDEFG", [12, 30, 40, 20, 54, 46, 8]): g.column_dimensions[col].width = w
g.freeze_panes = "A5"
t = gl + 3
labels = [("Compliant", f'=COUNTIF($D$5:$D${gl},"Compliant")'), ("Partially compliant", f'=COUNTIF($D$5:$D${gl},"Partially compliant")'),
          ("Non-compliant", f'=COUNTIF($D$5:$D${gl},"Non-compliant")'), ("Not applicable", f'=COUNTIF($D$5:$D${gl},"Not applicable")')]
g.cell(row=t, column=2, value="Summary (formulas)").font = Font(bold=True, color=NAVY)
for i, (l, f) in enumerate(labels, 1):
    g.cell(row=t + i, column=2, value=l); g.cell(row=t + i, column=3, value=f)
g.cell(row=t + 5, column=2, value="Applicable requirements").font = Font(bold=True)
g.cell(row=t + 5, column=3, value=f"=C{t+1}+C{t+2}+C{t+3}")
g.cell(row=t + 6, column=2, value="Compliance score").font = Font(bold=True)
g.cell(row=t + 6, column=3, value=f"=IF(C{t+5}=0,0,SUM(G5:G{gl})/C{t+5})").number_format = "0%"
g.cell(row=t + 7, column=2, value="Compliance level").font = Font(bold=True)
g.cell(row=t + 7, column=3, value=f'=IF(C{t+6}>=0.8,"High",IF(C{t+6}>=0.5,"Moderate","Low"))').font = Font(bold=True)
g.cell(row=t + 8, column=2, value="Level thresholds: High >= 80%, Moderate 50-79%, Low < 50%.")

wb.save("governance/RecipeBox_Cybersecurity_Governance.xlsx")
json.dump({"classification": [dict(zip(["id","element","location","personal","level","rationale","controls","access"], r)) for r in CLASSIFICATION],
           "gdpr": [dict(zip(["article","principle","requirement","status","evidence","action"], r)) for r in GDPR]},
          open("public/governance/governance.json", "w"), indent=1)
print("saved")
