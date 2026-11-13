## ADDED Requirements

### Requirement: Labels renamed and deleted in the app
A long press on a label in Browse SHALL offer Rename and Delete label, which SHALL also be accessibility actions of the row. Rename SHALL refuse an empty name and a name another label has, changing nothing. Delete SHALL ask for confirmation, stating how many tasks carry the label, and SHALL then remove the label from those tasks and delete it; the tasks SHALL stay. Both SHALL write the same ops as the web app and work offline.

#### Scenario: Rename a label
- **WHEN** the user long-presses the label "errand" in Browse, chooses Rename and enters "Errands"
- **THEN** Browse lists "Errands", and the web app shows the new name after the next sync

#### Scenario: Name already taken
- **WHEN** the user renames a label to the name of another label
- **THEN** the app says another label has this name, and both labels keep their names

#### Scenario: Delete a label
- **WHEN** the user deletes a label two open tasks carry and confirms
- **THEN** the label is gone from Browse, both tasks remain without it, and the server has the same after the next sync
