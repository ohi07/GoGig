// small helper to simulate API calls in the frontend prototype
export function fetchGigs(){
  return Promise.resolve(Array.from({length:9}).map((_,i)=>({
    id:String(i+1),
    title:['Logo Design','Web Development','SEO Audit'][i%3],
    description:'Short description',
    price:[50,200,120][i%3],
    image:''
  })))
}
