import { useToast } from './useToast'

export function useCopy() {
  const { success, error } = useToast()
  
  const copy = async (text: string, label: string = 'Text') => {
    try {
      await navigator.clipboard.writeText(text)
      success(`${label} copied to clipboard`)
    } catch (e) {
      console.error('Failed to copy:', e)
      error('Failed to copy to clipboard')
    }
  }
  
  const copyJSON = async (data: any, label: string = 'JSON') => {
    try {
      const text = JSON.stringify(data, null, 2)
      await navigator.clipboard.writeText(text)
      success(`${label} copied to clipboard`)
    } catch (e) {
      console.error('Failed to copy:', e)
      error('Failed to copy to clipboard')
    }
  }
  
  return {
    copy,
    copyJSON
  }
}

