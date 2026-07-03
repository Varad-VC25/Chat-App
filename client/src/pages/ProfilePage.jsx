import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import assets from '../assets/assets'
import { useContext } from 'react'
import { AuthContext } from '../../context/AuthContext'

const ProfilePage = () => {

    const {authUser, updateProfile} = useContext(AuthContext)

    const [selectedImg, setSelectedImg] = useState(null)
    const [removePhoto, setRemovePhoto] = useState(false)
    const navigate = useNavigate();
    const [name, setName] = useState(authUser.fullName)
    const [bio, setBio] = useState(authUser.bio)

    const handleSubmit = async (e)=>{
        e.preventDefault();
        
        // If user wants to remove photo
        if(removePhoto){
            await updateProfile({profilePic: "", fullName: name, bio});
            navigate('/');
            return;
        }
        
        if(!selectedImg){
            await updateProfile({fullName: name, bio});
            navigate('/');
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(selectedImg);
        reader.onload = async ()=>{
            const base64Image = reader.result;
            await updateProfile({profilePic: base64Image, fullName: name, bio})
            navigate('/');
        }
        
    }

  return (
    <div className='min-h-screen bg-cover bg-no-repeat flex items-center justify-center'>
        <div className='w-5/6 max-w-2xl backdrop-blur-2xl text-gray-300 border-2 border-gray-600 rounded-lg flex items-center justify-between max-sm:flex-col-reverse'>
            <form onSubmit={handleSubmit} className='flex-1 p-6 flex flex-col gap-5 p-10'>
                <h3 className='text-lg'>Profile details</h3>
                <label htmlFor="avatar" className='flex items-center gap-3 cursor-pointer'>
                  <input onChange={(e)=>{setSelectedImg(e.target.files[0]); setRemovePhoto(false)}} type="file" id='avatar' accept='.png, .jpg, .jpeg' hidden/>
                  <img src={removePhoto ? assets.avatar_icon : selectedImg ? URL.createObjectURL(selectedImg) : authUser?.profilePic || assets.avatar_icon} alt="" className={`w-12 h-12 rounded-full object-cover`}/>
                    Upload profile image
                </label>
               
                <input onChange={(e)=> setName(e.target.value)} value={name}
                type="text" required placeholder='Your name' className='p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500' />
                <textarea onChange={(e)=> setBio(e.target.value)} value={bio} placeholder="Write profile bio" required className="p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500" rows={4}></textarea>
                <button type='submit' className='bg-gradient-to-r from-purple-400 to-violet-600 text-white p-2 rounded-full text-lg cursor-pointer'>Save</button>
            </form>

            <div className='flex flex-col items-center mx-10 max-sm:mt-10 gap-8'>
            <img className='max-w-44 aspect-square rounded-full'
            src={ removePhoto ? assets.avatar_icon : selectedImg ? URL.createObjectURL(selectedImg) : authUser?.profilePic || assets.avatar_icon }
            alt=""/>

            {(selectedImg || authUser?.profilePic) && !removePhoto && (
            <button type='button' onClick={() => {
                setRemovePhoto(true); 
                setSelectedImg(null);
            }}
            className='text-red-400 text-sm hover:text-red-300'>Remove profile photo</button>
            )}
            </div>
        </div>
    </div>
  )
}

export default ProfilePage
