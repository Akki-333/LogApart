const db = require('./src/config/db');

async function updateUnitNumbers() {
  try {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    // We have 4 floors, 5 units per floor
    // Floor 1 -> no suffix
    // Floor 2 -> -1
    // Floor 3 -> -2
    // Floor 4 -> -3

    const [units] = await db.execute('SELECT id, floor FROM units ORDER BY floor ASC, id ASC');
    
    // Group units by floor
    const floorsMap = {};
    units.forEach(u => {
      if (!floorsMap[u.floor]) floorsMap[u.floor] = [];
      floorsMap[u.floor].push(u);
    });

    let count = 0;
    for (const [floorStr, floorUnits] of Object.entries(floorsMap)) {
      const floorNum = parseInt(floorStr);
      let suffix = '';
      if (floorNum === 2) suffix = '-1';
      else if (floorNum === 3) suffix = '-2';
      else if (floorNum === 4) suffix = '-3';

      for (let i = 0; i < floorUnits.length; i++) {
        const newNumber = `${letters[i]}${suffix}`;
        await db.execute('UPDATE units SET number = ? WHERE id = ?', [newNumber, floorUnits[i].id]);
        count++;
      }
    }

    console.log(`Successfully updated ${count} unit numbers to the new alphanumeric format.`);
  } catch (error) {
    console.error('Error updating units:', error);
  } finally {
    process.exit();
  }
}

updateUnitNumbers();
