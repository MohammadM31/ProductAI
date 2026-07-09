import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config/index.js'
import {
  indexDocument,
  searchDocuments,
  getDocument,
} from './databaseService.js'

export async function seedDemoData() {
  const os_users = await searchDocuments(config.indices.users, {
    query: { match_all: {} },
    size: 1,
  })
  if (os_users.length > 0) {
    console.log('ℹ️  Demo data already seeded')
    return
  }

  console.log('🌱 Seeding demo data…')

  // Create Marketing Department
  const marketingDeptId = 'dept-marketing-001'
  await indexDocument(config.indices.departments, marketingDeptId, {
    id: marketingDeptId,
    name: 'Marketing Department',
    description: 'Handles brand, content, social media, and menu communications.',
    created_at: new Date().toISOString(),
  })

  // Create Business Department
  const businessDeptId = 'dept-business-001'
  await indexDocument(config.indices.departments, businessDeptId, {
    id: businessDeptId,
    name: 'Business Department',
    description: 'Handles business content, corporate communications, and reports.',
    created_at: new Date().toISOString(),
  })

  // Hash passwords
  const adminHash = await bcrypt.hash('admin123', 10)
  const deptHash = await bcrypt.hash('marketing123', 10)
  const businessHash = await bcrypt.hash('business123', 10)
  const requesterHash = await bcrypt.hash('request123', 10)

  // Create Admin User - WITH PLAIN PASSWORD
  const adminId = 'user-admin-001'
  await indexDocument(config.indices.users, adminId, {
    id: adminId,
    email: 'admin@company.com',
    password_hash: adminHash,
    plain_password: 'admin123', // ← STORED FOR ADMIN VIEWING
    name: 'System Administrator',
    role: 'admin',
    department_id: null,
    created_at: new Date().toISOString(),
  })

  // Create Marketing Department User - WITH PLAIN PASSWORD
  const deptUserId = 'user-marketing-dept-001'
  await indexDocument(config.indices.users, deptUserId, {
    id: deptUserId,
    email: 'marketing@company.com',
    password_hash: deptHash,
    plain_password: 'marketing123', // ← STORED FOR ADMIN VIEWING
    name: 'Marketing Manager',
    role: 'dept_user',
    department_id: marketingDeptId,
    created_at: new Date().toISOString(),
  })

  // Create Business Department User - WITH PLAIN PASSWORD
  const businessUserId = 'user-business-dept-001'
  await indexDocument(config.indices.users, businessUserId, {
    id: businessUserId,
    email: 'business@company.com',
    password_hash: businessHash,
    plain_password: 'business123', // ← STORED FOR ADMIN VIEWING
    name: 'Business Manager',
    role: 'dept_user',
    department_id: businessDeptId,
    created_at: new Date().toISOString(),
  })

  // Create Requester User - WITH PLAIN PASSWORD
  const requesterId = 'user-requester-001'
  await indexDocument(config.indices.users, requesterId, {
    id: requesterId,
    email: 'staff@company.com',
    password_hash: requesterHash,
    plain_password: 'request123', // ← STORED FOR ADMIN VIEWING
    name: 'Staff Member',
    role: 'requester',
    department_id: null,
    created_at: new Date().toISOString(),
  })

  // Create Menu Item Images Project (Marketing Department)
  const menuProjectId = 'proj-menu-items-001'
  await indexDocument(config.indices.projects, menuProjectId, {
    id: menuProjectId,
    name: 'Menu Item Images',
    description: 'Generate professional food photography-style images for menu items.',
    department_id: marketingDeptId,
    output_type: 'image',
    trigger_keywords: 'menu item food dish meal plate recipe ingredient photograph photo image visual',
    system_prompt: `You are a professional food photographer and image prompt specialist for a high-end restaurant brand.

BRAND GUIDELINES:
- Style: Elegant, warm, appetizing. Natural light preferred.
- Background: Marble surfaces, dark wood, or linen tablecloths.
- Plating: Restaurant-quality presentation, garnished, artisanal.
- Mood: Premium, inviting, slightly rustic yet refined.
- Aspect ratio: Square (1:1) for menu use.
- Lighting: Warm tones, soft shadows, highlights on food texture.

When generating an image for a menu item:
1. Create a DALL-E prompt that captures the dish beautifully.
2. The dish must be the central focus, occupying 60–70% of the frame.
3. Include complementary props: rustic cutlery, fresh herbs, sauces.
4. Always mention the cuisine style in the prompt.

Output a single, optimised DALL-E image generation prompt. No extra text.`,
    reference_images: [],
    attached_files: [],
    image_model: 'flux-schnell',
    created_by: deptUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Create Instagram Posts Project (Marketing Department)
  const instaProjectId = 'proj-instagram-posts-001'
  await indexDocument(config.indices.projects, instaProjectId, {
    id: instaProjectId,
    name: 'Instagram Posts',
    description: 'Generate on-brand Instagram post images for marketing campaigns.',
    department_id: marketingDeptId,
    output_type: 'image',
    trigger_keywords: 'instagram post social media campaign promotion announcement brand lifestyle content story reel square',
    system_prompt: `You are the brand's social media creative director, specialising in Instagram content.

BRAND GUIDELINES:
- Aesthetic: Modern, vibrant, aspirational lifestyle.
- Color palette: Warm terracotta, cream, deep olive greens, gold accents.
- Typography feel: Clean, bold overlays (describe them in prompt if needed).
- Content types: Product shots, lifestyle moments, seasonal promotions, behind-the-scenes.
- Aspect ratio: Square 1:1 or 4:5 portrait for Instagram feed.
- Mood: Energetic, community-driven, authentic.

VISUAL RULES:
- Always specify lighting (golden hour, studio, natural daylight).
- Include brand context: restaurant setting, outdoor dining, market produce.
- No text overlays (DALL-E limitation) — describe the atmosphere instead.
- Composition: Rule of thirds, leading lines, strong focal point.

Output a single, optimised DALL-E image generation prompt. No extra text.`,
    reference_images: [],
    attached_files: [],
    image_model: 'flux-schnell',
    created_by: deptUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  // Create Business Report Project (Business Department)
  const businessProjectId = 'proj-business-reports-001'
  await indexDocument(config.indices.projects, businessProjectId, {
    id: businessProjectId,
    name: 'Business Reports',
    description: 'Generate business reports and corporate documents.',
    department_id: businessDeptId,
    output_type: 'image',
    trigger_keywords: 'report business corporate document analysis summary presentation',
    system_prompt: `You are a business analyst creating professional reports.

GUIDELINES:
- Use clear, professional language
- Include data-driven insights
- Format with proper headings and structure
- Include executive summaries
- Use bullet points for key takeaways`,
    reference_images: [],
    attached_files: [],
    image_model: 'flux-schnell',
    created_by: businessUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  console.log('✅ Demo data seeded successfully')
  console.log('   Accounts:')
  console.log('   admin@company.com / admin123  (Admin - sees everything)')
  console.log('   marketing@company.com / marketing123  (Marketing Dept)')
  console.log('   business@company.com / business123  (Business Dept)')
  console.log('   staff@company.com / request123  (Requester)')
  console.log('')
  console.log('   Projects:')
  console.log('   - Menu Item Images (Marketing Dept)')
  console.log('   - Instagram Posts (Marketing Dept)')
  console.log('   - Business Reports (Business Dept)')
}

export async function findUserByEmail(email) {
  try {
    const results = await searchDocuments(config.indices.users, {
      query: { term: { email: email.toLowerCase() } },
    })
    return results[0] || null
  } catch (err) {
    console.error('Error finding user by email:', err.message)
    return null
  }
}

export async function validateCredentials(email, password) {
  const user = await findUserByEmail(email.toLowerCase())
  if (!user) return null
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return null
  return user
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, department_id: user.department_id, name: user.name },
    config.jwtSecret,
    { expiresIn: '24h' }
  )
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret)
}