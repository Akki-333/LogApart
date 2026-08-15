const db = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function createGuard() {
  try {
    const passwordHash = await bcrypt.hash('guard123', 10);
    
    // Insert or update the guard user
    const query = `
      INSERT INTO users (name, email, password, role, phone) 
      VALUES ('Night Shift Guard', 'guard@apartadmin.com', ?, 'SECURITY', '9999999999')
      ON DUPLICATE KEY UPDATE name=name;
    `;
    
    await db.execute(query, [passwordHash]);
    console.log('Successfully created Security Guard user!');
    console.log('Login Email: guard@apartadmin.com');
    console.log('Password: guard123');

  } catch (error) {
    console.error('Error creating guard user:', error);
  } finally {
    process.exit();
  }
}

createGuard();
