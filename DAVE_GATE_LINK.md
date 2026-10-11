# DAVE AV Preparation — Cable Schedule Builder Link

The **Provide Cable Schedule** gate should open the builder at `/build` and pass the job context as URL parameters. The schedule editor then creates a dedicated browser-saved draft for that project, rather than sharing data with another job.

## Gate URL template

```text
https://avcablesch-7s7rlkhz.manus.space/build?projectId={PROJECT_ID}&projectName={PROJECT_NAME}&address={SITE_ADDRESS}&jobNumber={JOB_NUMBER}&client={CLIENT_NAME}&engineer={ENGINEER_NAME}&returnUrl={ENCODED_DAVE_PORTAL_URL}
```

| Parameter | Purpose | Example |
|---|---|---|
| `projectId` | Stable DAVE project identifier; used to keep drafts separate. | `AUS-PER-KAR-001` |
| `projectName` | Name displayed in the builder project context. | `Karrinyup Perth` |
| `address` | Site address displayed in the builder project context. | `Karrinyup Shopping Centre, Perth` |
| `jobNumber` | Pre-fills the Cable Schedule job number. | `AUS-PER-KAR-001` |
| `client` | Pre-fills the client header field. | `Multivrz` |
| `engineer` | Pre-fills the engineer header field. | `Billy Garbett` |
| `returnUrl` | DAVE portal page to reopen when marked ready for contractor issue. | `https://daveavpdx-7zurvaq5.manus.space/` |

## Karrinyup example

```text
https://avcablesch-7s7rlkhz.manus.space/build?projectId=AUS-PER-KAR-001&projectName=Karrinyup%20Perth&address=Karrinyup%20Shopping%20Centre%2C%20Perth&jobNumber=AUS-PER-KAR-001&client=Multivrz&engineer=Billy%20Garbett&returnUrl=https%3A%2F%2Fdaveavpdx-7zurvaq5.manus.space%2F
```

## Completion handoff

When the user selects **Mark ready for contractor issue**, the builder checks that at least one complete cable row is present and that no cable is marked as a fault. It then sends a `DAVE_CABLE_SCHEDULE_READY` browser message to the supplied return location and returns there with the following URL parameters:

```text
cableScheduleStatus=ready_for_issue
cableScheduleProjectId={PROJECT_ID}
cableScheduleRows={CABLE_COUNT}
```

The subsequent embedded-module version can receive this event and write the schedule, PDF, and Excel output directly into the relevant DAVE project record.
