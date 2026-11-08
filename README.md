# Economic Areas Near Greenspace for Green Rehabilitation

**Live interactive map:** [[Open my map]([https://gianniscaramuzzi.github.io/geog464-project/A2_Scaramuzzi/site/])

This map identifies Montréal economic-activity areas that are located near mapped greenspaces so planners can prioritize possible locations for green rehabilitation and other urban greening interventions.

## Map purpose
The map highlights where economic areas are closest to existing greenspace, helping to identify likely candidate sites for green rehabilitation projects and access-to-nature improvements.

## Key question
Which economic areas are nearest to mapped greenspaces, and where are the strongest opportunities for possible green rehabilitation?

## Testing
Test 1. I set the maximum distance to 100 m.
Expected: Only economic areas near greenspace within 100 m are highlighted.

Result: PASSED — The map displayed the nearest economic areas and updated the count correctly.

Test 2. I increase the maximum distance to 500 m.
Expected: More nearby economic areas appear as the search radius expands.

Result: PASSED — The map displayed additional nearby economic areas and updated the count accordingly.

Test 3. I set the maximum distance to 0 m.
Expected: Only the economic areas at zero distance are shown, and no-results messaging appears when none match.

Result: PASSED — The map correctly filtered to the nearest matches and showed a clear no-results message when appropriate.
