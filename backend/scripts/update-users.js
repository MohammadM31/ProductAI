import { config } from '../config/index.js'
import { searchDocuments, updateDocument } from '../services/databaseService.js'

async function updateUsers() {
  console.log('🔧 Adding plain_password to existing users...')
  
  try {
    const userPasswords = {
      'admin@company.com': 'admin123',
      'marketing@company.com': 'marketing123',
      'business@company.com': 'business123',
      'staff@company.com': 'request123'
    }
    
    const users = await searchDocuments(config.indices.users, {
      query: { match_all: {} },
      size: 100,
    })
    
    console.log(`📋 Found ${users.length} users`)
    
    let updatedCount = 0
    
    for (const user of users) {
      if (user.plain_password) {
        console.log(`✅ User ${user.email} already has plain_password`)
        continue
      }
      
      const password = userPasswords[user.email]
      
      if (!password) {
        console.log(`⚠️ No password for ${user.email}, skipping`)
        continue
      }
      
      await updateDocument(config.indices.users, user.id, {
        plain_password: password
      })
      
      console.log(`✅ Updated ${user.email} with password: ${password}`)
      updatedCount++
    }
    
    console.log(`\n✅ Updated ${updatedCount} users with plain_password`)
    console.log('\n📋 Credentials:')
    console.log('   admin@company.com / admin123')
    console.log('   marketing@company.com / marketing123')
    console.log('   business@company.com / business123')
    console.log('   staff@company.com / request123')
    
  } catch (err) {
    console.error('❌ Error:', err.message)
    console.error('Stack:', err.stack)
  }
}

updateUsers()