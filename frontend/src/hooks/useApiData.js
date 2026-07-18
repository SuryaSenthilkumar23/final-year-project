import { useEffect, useState } from 'react'

export default function useApiData(fetcher){
  const [state, setState] = useState({ loading:true, error:null, data:null })
  useEffect(()=>{
    let mounted=true
    fetcher()
      .then(data=> mounted && setState({ loading:false, error:null, data }))
      .catch(error=> mounted && setState({ loading:false, error:error.message, data:null }))
    return ()=>{ mounted=false }
  },[fetcher])
  return state
}
