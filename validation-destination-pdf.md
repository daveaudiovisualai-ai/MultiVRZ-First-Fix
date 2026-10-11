# Embedded cable-drop drawing validation

The supplied `MultiverseAVCableDropsv6.pdf` was inspected as a one-page Multiverse video display power-and-data cable location plan. It is now embedded as the default Karrinyup destination drawing through the web project’s managed storage path.

The desktop browser render confirms that the native PDF viewer appears in the Destination Drop Planner canvas, with the selected cable-drop marker layered above the rendered plan. The plan remains focused on one selected marker by default, preserving clickability and placement controls rather than obscuring the drawing with all 171 destination markers at once.

Interaction was tested by selecting **75" Briefing Room 2** from the schedule destinations list. The selected drop changed from **75" Briefing Room 1** to **75" Briefing Room 2**, retaining its calculated one-cable, one 2-way GOP allocation and updating the placement coordinates from 9% to 13% horizontally. This confirms the schedule list, selected marker and GOP detail panel are connected.
