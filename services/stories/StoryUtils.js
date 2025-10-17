const { ErrorWrapper } = require('backend-core')

module.exports = {
  parseBoolean,
  parseIntOrDefault,
  normalizeToArray,
  normalizeFilterValue,
  normalizeTags,
  parseOrderBy,
  sortObject,
  sanitizeTextFields,
  enforceDateRange
}

function parseBoolean (value, defaultValue = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return defaultValue
}

function parseIntOrDefault (value, defaultValue, maxValue) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue
  if (maxValue && parsed > maxValue) return maxValue
  return parsed
}

function normalizeToArray (value) {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) {
    return value.map(v => v?.toString().trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map(item => item?.toString().trim()).filter(Boolean)
        }
      } catch (error) {
        // fall back to comma split
      }
    }
    return trimmed.split(',').map(part => part.trim()).filter(Boolean)
  }

  return [value.toString().trim()].filter(Boolean)
}

function normalizeFilterValue (value) {
  const list = normalizeToArray(value)
  if (!list.length) return undefined
  if (list.length === 1) return list[0]
  return list
}

function normalizeTags (value) {
  const tags = normalizeToArray(value)
    .map(tag => (tag !== undefined && tag !== null ? String(tag) : '').toLowerCase())
    .filter(tag => tag.length >= 2 && tag.length <= 50 && /^[a-z0-9\-_]+$/.test(tag))
    .slice(0, 10)

  return Array.from(new Set(tags))
}

function parseOrderBy (value, config) {
  if (!value) return { ...config.defaultOrder }

  let parsed = value
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim()
    if (trimmed.startsWith('{')) {
      try {
        parsed = JSON.parse(trimmed)
      } catch (error) {
        parsed = config.defaultOrder
      }
    } else if (trimmed.includes(':')) {
      const [field, direction = config.defaultOrder.direction] = trimmed.split(':')
      parsed = { field: field.trim(), direction: direction.trim().toLowerCase() }
    } else {
      parsed = { field: trimmed, direction: config.defaultOrder.direction }
    }
  }

  if (Array.isArray(parsed)) {
    parsed = parsed[0] || config.defaultOrder
  }

  if (!config.orderableFields.includes(parsed.field)) {
    return { ...config.defaultOrder }
  }

  if (!['asc', 'desc'].includes(parsed.direction)) {
    parsed.direction = config.defaultOrder.direction
  }

  return parsed
}

function sortObject (value) {
  if (Array.isArray(value)) {
    return value.map(item => sortObject(item)).sort((a, b) => {
      const aStr = JSON.stringify(a)
      const bStr = JSON.stringify(b)
      if (aStr < bStr) return -1
      if (aStr > bStr) return 1
      return 0
    })
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortObject(value[key])
      return acc
    }, {})
  }

  return value
}

function sanitizeTextFields (payload = {}, fields = []) {
  const sanitized = { ...payload }
  fields.forEach(({ key, maxLength }) => {
    if (sanitized[key]) {
      sanitized[key] = sanitized[key].toString().trim().substring(0, maxLength)
    }
  })
  return sanitized
}

function enforceDateRange (from, to) {
  if (!from || !to) return
  const dateFrom = new Date(from)
  const dateTo = new Date(to)
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime()) || dateFrom >= dateTo) {
    throw new ErrorWrapper({
      code: 'INVALID_DATE_RANGE',
      message: 'dateFrom must be before dateTo',
      statusCode: 400
    })
  }
}
