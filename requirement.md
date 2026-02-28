📘 SOFTWARE REQUIREMENT SPECIFICATION (SRS)
1. EXECUTIVE SUMMARY
1.1 Product Name
Delivery Planning & Profitability Engine (DPPE)
1.2 Purpose
To provide a secure, deterministic, auditable internal application enabling Delivery, BA, Finance and Pre-Sales teams to:
Create structured delivery plans
Configure team & rates
Estimate effort
Calculate cost & profitability
Perform reverse margin calculations
Generate sprint allocation
Maintain project repository
Provide executive dashboards
1.3 Business Objective
Eliminate:
Excel dependency
Margin miscalculation
Manual reverse engineering
Inconsistent estimation
Ensure:
Accuracy
Traceability
Role-based governance
Financial risk mitigation
2. PRODUCT SCOPE
In Scope
✔ Project planning
✔ Team configuration
✔ Effort estimation
✔ Cost calculation
✔ Revenue modelling
✔ Profitability engine
✔ Reverse margin calculation
✔ Multi-currency
✔ Sprint engine
✔ Versioning
✔ Repository
✔ Dashboard
✔ Audit trail
Out of Scope (Phase 1)
✖ Payroll integration
✖ ERP integration
✖ Tax modelling
✖ Legal contract automation
3. DEFINITIONS
Term	Definition
Cost Rate	Internal cost per member
Billing Rate	Client charge rate
Utilization	Effective productive percentage
Sprint	Configurable timebox iteration
Margin	(Revenue - Cost) / Revenue
Version	Immutable snapshot of project plan
FTE (Full-Time Equivalent)	Project-level: team capacity per role (utilization_pct/100, summed by role). Drives sprint plan. Display: 2 decimal places.
4. SYSTEM OVERVIEW
4.1 Actors
Admin
Delivery Manager
Business Analyst
Finance Reviewer
Viewer
4.2 System Architecture
Frontend: Web (React/Next.js)
Backend: Python (FastAPI)
DB: PostgreSQL
Auth: SSO + RBAC
AI: Effort/Feature parsing
📘 FUNCTIONAL REQUIREMENT SPECIFICATION (FRS)
FR-1: Project Creation Module
Description
System shall allow creation of a financial project plan. For fixed-cost projects, the contract value is typically unknown at creation—the application is used to build proposals and estimates that will later be submitted to the client.
Inputs
Project Name (Mandatory)
Client Name
Revenue Model (Fixed / T&M / Milestone)
Currency (EUR/USD/INR)
Sprint Duration (Default 2 weeks)
Project Duration (months or sprints)
Fixed Revenue (Optional for Fixed model—added once proposal is finalized)
Output
Unique Project ID
Version 1 created
Audit entry logged
Validation
Project Name unique
Currency mandatory
FR-2: Team Configuration Module
Description
User can configure team composition.
Fields
Role
Member Name (Optional)
Monthly Cost Rate (Mandatory)
Billing Rate (Mandatory for T&M)
Utilization % (Mandatory, 0–100)
Working Days per Month (Default 20)
Hours per Day (Default 8)
Formula
Cost per hour =
Monthly Cost / (Working Days × Hours)
Effective Cost per hour =
Cost per hour / Utilization
Acceptance Rules
Utilization cannot exceed 100%
Monthly rate cannot be negative
Change triggers recalculation
FR-3: Feature & Effort Module
Description
BA can add/edit/remove features.
Fields
Feature Name
Description
Priority
Effort (Hours or Story Points)
Role distribution %
AI Function
If requirement text pasted:
AI generates features
AI estimates effort
User must approve before applying
System must not auto-save AI output.
FR-4: Sprint Engine
Default
2-week sprint
Configurable
1–4 weeks
Formula
Sprint Capacity =
Members × Working Days in Sprint × Hours × Utilization
Output
Number of sprints required
Effort per sprint
Resource allocation view
FR-5: Cost Engine
Total Cost =
Σ (Effort Hours × Effective Cost per Hour)
Add:
Contingency %
Management Reserve %
System shall display:
Base Cost
Risk Buffer
Total Cost
FR-6: Revenue Engine
Fixed Price
Revenue = Input Value
T&M
Revenue = Σ (Effort Hours × Billing Rate)
Milestone
Revenue = Sum(milestone amounts)
FR-7: Profitability Engine
Gross Margin % =
(Revenue - Cost) / Revenue × 100
Net Margin % (if reserve applied)
System shall display:
Revenue
Cost
Gross Margin
Net Margin
FR-8: Reverse Profitability Calculation
Input
Target Margin %
System Shall Calculate
Required Revenue =
Cost / (1 - Target Margin)
OR
Required Billing Rate =
Required Revenue / Total Effort Hours
FR-9: Multi-Currency Module
Currency selectable at project creation
FX rate snapshot stored
Conversion locked to snapshot
Manual refresh allowed with approval
FR-10: Versioning Module
Every save creates new version
Version immutable
Compare versions feature available
FR-11: Lock Mechanism
Locking occurs when project status transitions to Won (see FR-11a).
Locked state:
Editing disabled
Unlock requires reason
Unlock logged
FR-11a: Project Status Workflow
Status flow: Draft → Review → Submitted → Won
Draft: Initial state; plan being built; cost/estimation in progress
Review: Internal review of proposal before client submission
Submitted: Proposal submitted to client; negotiation on efforts/estimation may occur
Won: Deal won; plan is locked automatically
Locking happens only when status becomes Won.
FR-12: Repository
System shall maintain:
Total projects created
Created by
Date
Revenue
Cost
Margin
Status (Draft / Review / Submitted / Won)
Searchable and filterable.
FR-13: Dashboard
KPIs:
Total simulated revenue
Total simulated cost
Avg margin %
Margin distribution
Project count by month
Top roles used
Projects below threshold margin
📘 NON-FUNCTIONAL REQUIREMENTS (NFR)
NFR-1: Security
SSO mandatory
Role-based access
Data encrypted at rest
All financial changes logged
NFR-2: Performance
Calculation < 2 sec
Dashboard < 3 sec
Concurrent users ≥ 200
NFR-3: Accuracy
Decimal precision: 2 places
No rounding drift
All formulas deterministic
NFR-4: Availability
99.5% uptime
Backup daily
📘 BUSINESS RULES
Utilization mandatory
Negative margin flagged
Margin below threshold (e.g., 15%) → red warning
FX cannot auto-update without approval
Locked project cannot be edited
AI suggestions require manual approval
📘 CALCULATION ENGINE SPECIFICATION
All calculations must:
Use centralized formula engine
Be version-aware
Be logged
Precision Rule:
Use decimal type (NOT float).
Rounding:
Round only at display layer.
📘 DATA MODEL (Logical)
Entities:
Project
ProjectVersion
TeamMember
Feature
EffortAllocation
CostBreakdown
RevenueBreakdown
AuditLog
CurrencySnapshot
SprintConfig
Relationships:
Project → Versions (1:M)
Version → Team (1:M)
Version → Features (1:M)
📘 ROLE ACCESS MATRIX
Action	Admin	DM	BA	Finance	Viewer
Create Project	✔	✔	✔	✔	✖
Edit Team	✔	✔	✖	✖	✖
Edit Feature	✔	✔	✔	✖	✖
Lock Project	✔	✖	✖	✔	✖
View Dashboard	✔	✔	✔	✔	✔
📘 USER STORIES + ACCEPTANCE CRITERIA
US-1 Create Plan
Given user logged in
When user enters required fields
Then system creates Project ID and Version 1
And logs audit entry
US-2 Add Team Member
Given project draft
When user adds role and rate
Then cost recalculates automatically
And audit entry created
US-3 Reverse Margin
Given cost calculated
When user inputs 25% margin
Then system calculates required revenue
And updates billing rate
US-4 Mark as Won (Lock)
Given proposal in Submitted status
When finance marks project as Won
Then status becomes Won
And plan is locked (editing disabled)
And unlock requires reason
📘 RISK & CONTROL FRAMEWORK
Risk: Incorrect Rate Entry
Control:
Threshold validation
Historical comparison warning
Risk: Margin Manipulation
Control:
Versioning
Locking
Audit trail
Risk: FX Volatility
Control:
Snapshot storage
Manual approval for refresh
Risk: AI Overestimation
Control:
Manual approval mandatory
Editable effort
📘 ASSUMPTIONS
Working days default = 20/month
Hours per day = 8
Utilization default = 80%
Sprint default = 2 weeks




New Requirement:
- A user can upload the requirement doc, ToR etc. 
- use chatgpt mini model to convert that into the features
- estimate the feature through the AI
- decides the no. of team members allocation on the project (REALISTIC)
- Add human-in-loop design
- Allow user to add/modify 




Sprint Planning — Steps:
1. Total effort (from features + task contingency + version contingency)
2. Sprint weeks (from project creation — sprint_duration_weeks)
3. Total sprints = ceil(total_effort / sprint_capacity)
4. Generate table with sprints_required rows, cells = role capacity (1=100%, 0.5=50%, etc.)
5. Sprint plan is driven by **project-level FTE** (team composition); see FR-FTE below.

Sprint Planning Format:

                    Technical Architect     Project Manager     QA  etc. 
FTE (capacity)      1                       0.5                1
Sprint 1 
         Week 1         1                       0.5              1
         Week 2         1                       0.5              1
Sprint 2 
        Week 1          1                       .5              1
        Week 2          1                       .5              1


Pre UAT 
UAT
Go Live

---

FR-FTE: FTE (Full-Time Equivalent) Requirements
- **Display precision**: FTE values shall be displayed with 2 decimal places (e.g. 0.09, 1.50).
- **Project-level FTE**: FTE is defined at the project level via team composition. Each team member contributes FTE = utilization_pct / 100 (e.g. 80% → 0.8 FTE). Multiple members with the same role sum to that role's total FTE.
- **Sprint plan driven by project FTE**: The sprint allocation plan shall use project-level FTE (role capacity) as the basis. The "FTE (capacity)" row in the sprint planning table shows the project-level FTE per role. New sprints and phases are pre-filled with these values.
- **Task-level FTE (derived)**: Task/effort allocation FTE = effort_hours / 128 (person-months) is a derived metric for cost and roll-up. Display with 2 decimals.

