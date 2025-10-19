export function useCopy() {
  const toast = useToast()
  
  const copy = async (text: string, label: string = 'Text') => {
    try {
      await navigator.clipboard.writeText(text)
      toast.add({ title: `${label} copied to clipboard`, color: 'green' })
    } catch (e) {
      console.error('Failed to copy:', e)
      toast.add({ title: 'Failed to copy to clipboard', color: 'red' })
    }
  }
  
  const copyJSON = async (data: any, label: string = 'JSON') => {
    try {
      const text = JSON.stringify(data, null, 2)
      await navigator.clipboard.writeText(text)
      toast.add({ title: `${label} copied to clipboard`, color: 'green' })
    } catch (e) {
      console.error('Failed to copy:', e)
      toast.add({ title: 'Failed to copy to clipboard', color: 'red' })
    }
  }
  
  return {
    copy,
    copyJSON
  }
}

