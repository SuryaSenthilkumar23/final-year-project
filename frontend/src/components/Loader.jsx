import React from 'react'
export default function Loader({message='Loading...'}){
  return <div className="loader-block"><div className="loader-spinner"></div><span>{message}</span></div>
}
