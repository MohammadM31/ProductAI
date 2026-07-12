// services/cacheService.js
import { searchDocuments } from './databaseService.js'
import { config } from '../config/index.js'

// In-memory cache with TTL
class CacheService {
  constructor() {
    this.cache = {}
    this.ttl = 60000 // 1 minute cache
  }

  async getProjects() {
    const now = Date.now()
    
    // Check if cache exists and is still valid
    if (this.cache.projects && (now - this.cache.projects.timestamp) < this.ttl) {
      console.log('📦 Using cached projects')
      return this.cache.projects.data
    }
    
    // Fetch fresh data
    console.log('🔄 Fetching fresh projects from OpenSearch')
    const projects = await searchDocuments(config.indices.projects, {
      query: { match_all: {} },
      size: 50,
    })
    
    // Store in cache
    this.cache.projects = {
      data: projects,
      timestamp: now
    }
    
    return projects
  }

  async getDepartments() {
    const now = Date.now()
    
    if (this.cache.departments && (now - this.cache.departments.timestamp) < this.ttl) {
      return this.cache.departments.data
    }
    
    const departments = await searchDocuments(config.indices.departments, {
      query: { match_all: {} },
      size: 50,
    })
    
    this.cache.departments = {
      data: departments,
      timestamp: now
    }
    
    return departments
  }

  // Clear cache when projects update
  clearProjects() {
    delete this.cache.projects
    console.log('🧹 Projects cache cleared')
  }
}

export const cache = new CacheService()