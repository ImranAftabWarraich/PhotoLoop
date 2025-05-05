// Add these two lines at the very beginning of your file, before your DOMContentLoaded event
console.log('main.js loaded');
let loadingScreenForced = false;

// Force the loading screen to close after a timeout as a fallback
setTimeout(() => {
  if (!loadingScreenForced) {
    console.log('Forcing loading screen to close after timeout');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
      }, 500);
      loadingScreenForced = true;
    }
  }
}, 5000);

//Document ready function
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM content loaded, initializing app');
  
  // Make sure we have a theme class
  if (!document.body.className.includes('theme-')) {
    console.log('No theme class detected, adding default theme');
    document.body.classList.add('theme-default');
  }
  
  try {
    // Initialize 3D environment with error handling
    console.log('Attempting to initialize ThreeJS');
    initThreeJS();
    console.log('ThreeJS initialized successfully');
  } catch (error) {
    console.error('Failed to initialize ThreeJS:', error);
    // If ThreeJS fails, don't let it block the app
  }
  
  // Variables to hold captured image and state
  let capturedImage = null;
  let cameraStream = null;
  
  // New variables for video recording
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;
  let recordingTimer = null;
  let recordingDuration = 0;
  const MAX_RECORDING_DURATION = 30; // Maximum recording time in seconds
  
  // DOM Elements
  const previewContainer = document.getElementById('preview-container');
  const cameraFeed = document.getElementById('camera-feed');
  const captureBtn = document.getElementById('capture-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const retakeBtn = document.getElementById('retake-btn');
  const countdown = document.getElementById('countdown');
  const flash = document.getElementById('flash');
  const gallery = document.getElementById('gallery');
  const successModal = document.getElementById('success-modal');
  const uploadedImage = document.getElementById('uploaded-image');
  const imageUrlInput = document.getElementById('image-url');
  const closeModalBtn = document.getElementById('close-modal');
  const errorToast = document.getElementById('error-toast');
  const loadingScreen = document.getElementById('loading-screen');
  const fileInput = document.getElementById('file-input');
  const uploadFromDeviceBtn = document.getElementById('upload-from-device');
  
  // Check if DOM elements were found
  console.log('Checking key DOM elements:');
  console.log('- previewContainer:', !!previewContainer);
  console.log('- cameraFeed:', !!cameraFeed);
  console.log('- captureBtn:', !!captureBtn);
  console.log('- uploadBtn:', !!uploadBtn);
  console.log('- loadingScreen:', !!loadingScreen);
  
  // New DOM elements for video recording
  const recordBtn = document.getElementById('record-btn');
  const timerDisplay = document.getElementById('timer-display');
  const photoModeBtn = document.getElementById('photo-mode-btn');
  const videoModeBtn = document.getElementById('video-mode-btn');

  // Debug check - do we have the media buttons?
  if (!photoModeBtn || !videoModeBtn) {
    console.warn('Media mode buttons not found in DOM');
    // We need to handle this more gracefully - set a default mode
    document.body.classList.add('photo-mode');
  } else {
    // Mode selection
    photoModeBtn.addEventListener('click', () => {
      setMediaMode('photo');
    });

    videoModeBtn.addEventListener('click', () => {
      setMediaMode('video');
    });
  }

  // Set default photo mode - important to ensure UI buttons are visible
  if (!document.body.classList.contains('photo-mode') && !document.body.classList.contains('video-mode')) {
    console.log('No media mode class detected, setting photo mode as default');
    document.body.classList.add('photo-mode');
    if (captureBtn) captureBtn.classList.remove('hidden');
    if (recordBtn) recordBtn.classList.add('hidden');
    if (timerDisplay) timerDisplay.classList.add('hidden');
  }

  // Set media capture mode
  function setMediaMode(mode) {
    console.log(`Setting media mode to: ${mode}`);
    // Reset any existing capture
    resetCamera();
    
    if (mode === 'photo') {
      document.body.classList.remove('video-mode');
      document.body.classList.add('photo-mode');
      if (captureBtn) captureBtn.classList.remove('hidden');
      if (recordBtn) recordBtn.classList.add('hidden');
      if (timerDisplay) timerDisplay.classList.add('hidden');
    } else {
      document.body.classList.remove('photo-mode');
      document.body.classList.add('video-mode');
      if (captureBtn) captureBtn.classList.add('hidden');
      if (recordBtn) recordBtn.classList.remove('hidden');
    }
  }

// Trigger file input when the "Upload from Device" button is clicked
if (uploadFromDeviceBtn) {
  uploadFromDeviceBtn.addEventListener('click', () => {
    fileInput.click();
  });
}

// Handle file selection
if (fileInput) {
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const isVideo = file.type.startsWith('video/');
      console.log(`Selected file type: ${file.type}, handling as ${isVideo ? 'video' : 'image'}`);
      
      setMediaMode(isVideo ? 'video' : 'photo');
      
      if (isVideo) {
        const videoURL = URL.createObjectURL(file);
        const videoElement = document.createElement('video');
        videoElement.src = videoURL;
        videoElement.controls = true;
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.objectFit = 'cover';
        
        cameraFeed.innerHTML = '';
        cameraFeed.appendChild(videoElement);
        
        // Store the file directly for upload
        recordedChunks = [file];
        capturedImage = null;
        
        uploadBtn.disabled = false;
        retakeBtn.disabled = false;
        if (recordBtn) recordBtn.disabled = true;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';

          cameraFeed.innerHTML = '';
          cameraFeed.appendChild(img);

          capturedImage = e.target.result;
          recordedChunks = [];

          uploadBtn.disabled = false;
          retakeBtn.disabled = false;
          if (captureBtn) captureBtn.disabled = true;
        };
        reader.readAsDataURL(file);
      }
    }
  });
}

// Upload image to Cloudinary
// Fix for the upload function to properly handle videos
if (uploadBtn) {
  uploadBtn.addEventListener('click', async () => {
    if (!capturedImage && recordedChunks.length === 0) {
      console.warn('No captured media to upload');
      showError('No media to upload');
      return;
    }

    showLoading(true);
    
    // Determine if this is a video
    const isVideo = document.body.classList.contains('video-mode') || 
                   (fileInput.files[0] && fileInput.files[0].type.startsWith('video/'));
    const fileType = isVideo ? 'video' : 'image';
    console.log(`Preparing to upload ${fileType}`);
    
    let formData = new FormData();
    
    try {
      if (isVideo) {
        // Handle recorded video chunks
        if (recordedChunks.length > 0) {
          const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
          formData.append('media', videoBlob, 'recording.webm');
        } 
        // Handle uploaded video file
        else if (fileInput.files[0]) {
          formData.append('media', fileInput.files[0]);
        } else {
          throw new Error('No video data available');
        }
      } else {
        // Handle image upload
        const imgBlob = dataURItoBlob(capturedImage);
        formData.append('media', imgBlob, 'photo.jpg');
      }
      
      formData.append('eventTag', document.body.className.replace('theme-', '').replace(' video-mode', '').replace(' photo-mode', ''));
      formData.append('fileType', fileType);

      // Show upload progress
      const progressElement = document.createElement('div');
      progressElement.className = 'upload-progress';
      progressElement.innerHTML = '<div class="progress-bar"><div class="progress-fill"></div></div><div class="progress-text">Uploading: 0%</div>';
      document.body.appendChild(progressElement);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Upload failed');
      }

      // Handle success
      showLoading(false);
      progressElement.remove();
      
      // Display the uploaded media
      if (fileType === 'video') {
        const videoElement = document.createElement('video');
        videoElement.src = data.media.url;
        videoElement.controls = true;
        videoElement.style.width = '100%';
        videoElement.style.maxHeight = '300px';
        
        const uploadedContainer = document.getElementById('uploaded-image-container');
        uploadedContainer.innerHTML = '';
        uploadedContainer.appendChild(videoElement);
      } else {
        uploadedImage.src = data.media.url;
        uploadedImage.style.display = 'block';
      }
      
      imageUrlInput.value = data.media.url;
      successModal.classList.remove('hidden');
      
      // Add to gallery
      addToGallery(data.media.url, fileType, data.media.duration);
      
      // Reset for next capture
      resetCamera();
      
    } catch (error) {
      console.error('Upload error:', error);
      showLoading(false);
      showError(`Failed to upload ${isVideo ? 'video' : 'image'}: ${error.message}`);
    }
  });
}

  // Hide loading screen after initialization
  console.log('Setting up loading screen timeout');
  setTimeout(() => {
    if (loadingScreen) {
      console.log('Hiding loading screen through normal flow');
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        loadingScreenForced = true;
      }, 500);
    }
  }, 2000);
  
  // Initialize camera
  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      if (!cameraStream) {
        // First click - initialize camera
        console.log('Initializing camera on button click');
        initCamera();
      } else {
        // Camera is already running - take photo
        console.log('Starting countdown for photo capture');
        startCountdown();
      }
    });
  }
  
  // Function to initialize camera
  function initCamera(withAudio = false) {
    console.log(`Initializing camera (with audio: ${withAudio})`);
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const constraints = { 
        video: true,
        audio: withAudio
      };
      
      navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
          console.log('Camera access granted');
          cameraStream = stream;
          
          // Create video element
          const video = document.createElement('video');
          video.srcObject = stream;
          video.setAttribute('playsinline', true); // required for iOS
          video.setAttribute('autoplay', true);
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          
          // Clear camera placeholder and add video
          cameraFeed.innerHTML = '';
          cameraFeed.appendChild(video);
          video.play();
          
          // Update button text based on mode
          if (document.body.classList.contains('video-mode')) {
            if (recordBtn) recordBtn.textContent = 'Start Recording';
          } else {
            if (captureBtn) captureBtn.textContent = 'Take Photo';
          }
          
          // Apply a 3D effect to the preview
          previewContainer.style.transform = 'perspective(1000px) rotateX(2deg) rotateY(-2deg)';
          
          // Add animation
          animatePreview();
        })
        .catch(error => {
          console.error('Camera error:', error);
          showError('Camera access denied or not available');
        });
    } else {
      console.error('getUserMedia not supported');
      showError('Camera not supported in this browser');
    }
  }
  

  // Handle record button click
  if (recordBtn) {
    recordBtn.addEventListener('click', () => {
      if (!cameraStream) {
        // First click - initialize camera with audio
        console.log('Initializing camera with audio for recording');
        initCamera(true);
        return;
      }
      
      if (!isRecording) {
        console.log('Starting video recording');
        startRecording();
      } else {
        console.log('Stopping video recording');
        stopRecording();
      }
    });
  }
  
  // Start video recording
  function startRecording() {
    if (!cameraStream) {
      console.warn('No camera stream available for recording');
      return;
    }
    
    try {
      // Clear any existing recorded chunks
      recordedChunks = [];
      
      // Try different MIME types in case vp9 isn't supported
      let options;
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options = { mimeType: 'video/webm; codecs=vp9' };
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options = { mimeType: 'video/webm; codecs=vp8' };
      } else {
        options = { mimeType: 'video/webm' }; // Try default
      }
      
      mediaRecorder = new MediaRecorder(cameraStream, options);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('Media recorder stopped');
        const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        
        // Replace video stream with recorded video
        const recordedVideo = document.createElement('video');
        recordedVideo.src = videoUrl;
        recordedVideo.controls = true;
        recordedVideo.style.width = '100%';
        recordedVideo.style.height = '100%';
        recordedVideo.style.objectFit = 'cover';
        
        cameraFeed.innerHTML = '';
        cameraFeed.appendChild(recordedVideo);
        recordedVideo.play();
        
        // Store recorded video
        capturedImage = videoUrl;
        
        // Enable upload and retake buttons
        uploadBtn.disabled = false;
        retakeBtn.disabled = false;
        recordBtn.disabled = true;
        
        // Reset timer
        clearInterval(recordingTimer);
        timerDisplay.textContent = '00:00';
        timerDisplay.classList.add('hidden');
      };
      
      // Start recording with 1-second chunks
      mediaRecorder.start(1000);
      isRecording = true;
      recordBtn.textContent = 'Stop Recording';
      recordBtn.classList.add('recording');
      
      // Show and start timer
      recordingDuration = 0;
      timerDisplay.textContent = '00:00';
      timerDisplay.classList.remove('hidden');
      
      recordingTimer = setInterval(() => {
        recordingDuration++;
        const minutes = Math.floor(recordingDuration / 60).toString().padStart(2, '0');
        const seconds = (recordingDuration % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${minutes}:${seconds}`;
        
        // Auto-stop if max duration reached
        if (recordingDuration >= MAX_RECORDING_DURATION) {
          console.log('Max recording duration reached, stopping');
          stopRecording();
        }
      }, 1000);
      
    } catch (err) {
      console.error('Recording error:', err);
      showError('Recording failed: ' + err.message);
    }
  }
  
  
  // Stop video recording
  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      recordBtn.textContent = 'Record Again';
      recordBtn.classList.remove('recording');
    }
  }
  
  // Countdown and capture
  function startCountdown() {
    countdown.classList.remove('hidden');
    let count = 3;
    countdown.innerHTML = `<span>${count}</span>`;
    console.log('Starting countdown:', count);
    
    const countInterval = setInterval(() => {
      count--;
      console.log('Countdown:', count);
      
      if (count <= 0) {
        clearInterval(countInterval);
        countdown.classList.add('hidden');
        capturePhoto();
      } else {
        countdown.innerHTML = `<span>${count}</span>`;
      }
    }, 1000);
  }
    
  // Capture photo
function capturePhoto() {
  // Trigger flash effect
  flash.classList.remove('hidden');
  flash.style.opacity = '1';
  
  setTimeout(() => {
    flash.style.opacity = '0';
    setTimeout(() => {
      flash.classList.add('hidden');
    }, 300);
  }, 100);
  
  // Capture from video stream
  const video = cameraFeed.querySelector('video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Store captured image
  capturedImage = canvas.toDataURL('image/jpeg');
  
  // Replace video with captured image
  const img = document.createElement('img');
  img.src = capturedImage;
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  
  cameraFeed.innerHTML = '';
  cameraFeed.appendChild(img);
  
  // Enable upload and retake buttons
  if (uploadBtn) uploadBtn.disabled = false;
  if (retakeBtn) retakeBtn.disabled = false;
  if (captureBtn) captureBtn.disabled = true;
}

// Retake photo or video
if (retakeBtn) {
  retakeBtn.addEventListener('click', () => {
    resetCamera();
  });
}

// Close modal
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    successModal.classList.add('hidden');
  });
}

// Helper function to convert dataURI to blob
function dataURItoBlob(dataURI) {
  try {
    // Split the dataURI into its components
    const splitDataURI = dataURI.split(',');
    const byteString = splitDataURI[0].indexOf('base64') >= 0
      ? atob(splitDataURI[1])
      : decodeURIComponent(splitDataURI[1]);
    
    const mimeString = splitDataURI[0].split(':')[1].split(';')[0];
    
    // Write the bytes to an ArrayBuffer
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([arrayBuffer], { type: mimeString });
  } catch (error) {
    console.error('Error converting data URI to Blob:', error);
    throw error;
  }
}

// Add media to gallery
function addToGallery(mediaUrl, mediaType, duration) {
  if (!gallery) {
    console.error('Gallery element not found');
    return;
  }

  const galleryContainer = document.querySelector('.gallery-container');
  if (galleryContainer) {
    galleryContainer.classList.remove('hidden');
  }
  
  if (mediaType === 'image') {
    const img = document.createElement('img');
    img.src = mediaUrl;
    img.alt = 'Gallery image';
    img.className = 'gallery-item gallery-image';
    img.addEventListener('click', () => {
      if (document.getElementById('uploaded-video')) {
        document.getElementById('uploaded-video').style.display = 'none';
      }
      uploadedImage.src = mediaUrl;
      uploadedImage.style.display = 'block';
      imageUrlInput.value = mediaUrl;
      successModal.classList.remove('hidden');
    });
    
    gallery.prepend(img);
  } else {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'gallery-item gallery-video';
    
    // Create thumbnail with play button overlay
    const thumbnail = document.createElement('div');
    thumbnail.className = 'video-thumbnail';
    
    // Create play icon
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    playIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
    
    // Create duration badge
    if (duration) {
      const durationBadge = document.createElement('div');
      durationBadge.className = 'duration-badge';
      const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
      const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
      durationBadge.textContent = `${minutes}:${seconds}`;
      thumbnail.appendChild(durationBadge);
    }
    
    thumbnail.appendChild(playIcon);
    videoContainer.appendChild(thumbnail);
    
    videoContainer.addEventListener('click', () => {
      if (!document.getElementById('uploaded-video')) {
        const video = document.createElement('video');
        video.id = 'uploaded-video';
        video.controls = true;
        video.style.width = '100%';
        video.style.maxHeight = '300px';
        video.src = mediaUrl;
        uploadedImage.parentNode.insertBefore(video, uploadedImage);
      } else {
        const video = document.getElementById('uploaded-video');
        video.src = mediaUrl;
        video.style.display = 'block';
      }
      
      uploadedImage.style.display = 'none';
      imageUrlInput.value = mediaUrl;
      successModal.classList.remove('hidden');
    });
    
    gallery.prepend(videoContainer);
    
    // Create a temporary video element to get the poster/thumbnail
    const tempVideo = document.createElement('video');
    tempVideo.src = mediaUrl;
    tempVideo.muted = true;
    tempVideo.currentTime = 1; // Seek to 1 second
    
    tempVideo.addEventListener('loadeddata', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = tempVideo.videoWidth;
        canvas.height = tempVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        
        // Set the thumbnail background image
        thumbnail.style.backgroundImage = `url(${canvas.toDataURL()})`;
      } catch (error) {
        console.error('Error creating video thumbnail:', error);
        thumbnail.style.backgroundColor = '#000';
      } finally {
        // Clean up
        tempVideo.remove();
      }
    });
    
    tempVideo.addEventListener('error', () => {
      console.error('Error loading video for thumbnail');
      thumbnail.style.backgroundColor = '#000';
      tempVideo.remove();
    });
  }
}

function isImageTooLarge(dataUrl) {
  // Estimate base64 size
  const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
  const sizeInBytes = (base64Length * 3) / 4;
  const sizeInMB = sizeInBytes / (1024 * 1024);
  
  return sizeInMB > 2;
}

function compressImage(dataUrl, quality, maxWidth) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
      }
      
      // Create canvas for resizing
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      // Draw and compress image
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get compressed data URL
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    
    img.src = dataUrl;
  });
}

// Updated reset camera function
// Updated reset camera function
function resetCamera() {
  capturedImage = null;
  
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingDuration = 0;
    if (timerDisplay) {
      timerDisplay.textContent = '00:00';
      timerDisplay.classList.add('hidden');
    }
  }
  
  // Keep the recordedChunks array but clear it
  recordedChunks = [];
  isRecording = false;
  
  // Reinitialize video stream if camera is still active
  if (cameraStream && cameraStream.active) {
    const video = document.createElement('video');
    video.srcObject = cameraStream;
    video.setAttribute('playsinline', true);
    video.setAttribute('autoplay', true);
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    
    if (cameraFeed) {
      cameraFeed.innerHTML = '';
      cameraFeed.appendChild(video);
      video.play();
    }
  } else if (cameraFeed) {
    cameraFeed.innerHTML = '<div class="camera-placeholder"><span>Camera Preview</span></div>';
  }
  
  // Reset buttons based on current mode
  if (uploadBtn) uploadBtn.disabled = true;
  if (retakeBtn) retakeBtn.disabled = true;
  
  if (document.body.classList.contains('video-mode')) {
    if (recordBtn) {
      recordBtn.disabled = false;  // Always enable record button in video mode
      recordBtn.textContent = 'Start Recording';
      recordBtn.classList.remove('recording');
    }
  } else {
    if (captureBtn) captureBtn.disabled = false;
  }
  
  // Re-initialize camera if needed
  if (!cameraStream || !cameraStream.active) {
    const withAudio = document.body.classList.contains('video-mode');
    console.log('Re-initializing camera with audio:', withAudio);
    initCamera(withAudio);
  }
}


// Show error toast
function showError(message) {
  const errorToast = document.getElementById('error-toast');
  if (errorToast) {
    errorToast.querySelector('p').textContent = message;
    errorToast.classList.remove('hidden');
    
    setTimeout(() => {
      errorToast.classList.add('hidden');
    }, 3000);
  } else {
    console.error('Error toast element not found:', message);
  }
}

// Show/hide loading indicator
function showLoading(show) {
  if (!loadingScreen) {
    console.warn('Loading screen element not found');
    return;
  }
  
  if (show) {
    loadingScreen.classList.remove('hidden');
    loadingScreen.style.opacity = '1';
  } else {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
    }, 500);
  }
}

// Animate preview with subtle movements
function animatePreview() {
  if (!previewContainer) return;
  
  const rotateX = Math.sin(Date.now() * 0.001) * 2;
  const rotateY = Math.cos(Date.now() * 0.001) * 2;
  
  previewContainer.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  
  requestAnimationFrame(animatePreview);
}

// Initialize Three.js for background effects
function initThreeJS() {
  const container = document.getElementById('three-container');
  if (!container) {
    console.warn('Three.js container not found');
    return;
  }
  
  // Check if THREE is available
  if (typeof THREE === 'undefined') {
    console.error('THREE.js is not loaded');
    return;
  }
  
  // Create scene
  const scene = new THREE.Scene();
  
  // Create camera
  const camera = new THREE.PerspectiveCamera(
    75, 
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;
  
  // Create renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  
  // Get theme colors for particles
  const computedStyle = getComputedStyle(document.documentElement);
  const primaryColor = document.body.classList.contains('theme-wedding') ? 
    0xf9a8d4 : document.body.classList.contains('theme-party') ? 
    0x3b82f6 : 0xf43f5e;
  
  const secondaryColor = document.body.classList.contains('theme-wedding') ? 
    0xc084fc : document.body.classList.contains('theme-party') ? 
    0x10b981 : 0x8b5cf6;
  
  // Create particles
  const particlesCount = window.innerWidth < 768 ? 100 : 200;
  const particles = new THREE.Group();
  
  for (let i = 0; i < particlesCount; i++) {
    const geometry = new THREE.SphereGeometry(0.05, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? primaryColor : secondaryColor,
      transparent: true,
      opacity: 0.7
    });
    
    const particle = new THREE.Mesh(geometry, material);
    
    // Random position
    particle.position.x = (Math.random() - 0.5) * 10;
    particle.position.y = (Math.random() - 0.5) * 10;
    particle.position.z = (Math.random() - 0.5) * 10;
    
    // Add metadata for animation
    particle.userData = {
      speed: Math.random() * 0.01 + 0.003,
      direction: new THREE.Vector3(
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.01
      )
    };
    
    particles.add(particle);
  }
  
  scene.add(particles);
  
  // Create floating frames (decorative elements)
  const framesCount = window.innerWidth < 768 ? 3 : 5;
  const frames = new THREE.Group();
  
  for (let i = 0; i < framesCount; i++) {
    const width = Math.random() * 2 + 1;
    const height = width * 0.75; // 4:3 aspect ratio
    const thickness = 0.05;
    
    // Frame geometry
    const frameGeometry = new THREE.BoxGeometry(width, height, thickness);
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? primaryColor : secondaryColor,
      transparent: true,
      opacity: 0.3,
      wireframe: true
    });
    
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    
    // Random position
    frame.position.x = (Math.random() - 0.5) * 15;
    frame.position.y = (Math.random() - 0.5) * 15;
    frame.position.z = (Math.random() - 0.5) * 5 - 3;
    
    // Random rotation
    frame.rotation.x = Math.random() * Math.PI;
    frame.rotation.y = Math.random() * Math.PI;
    
    // Add metadata for animation
    frame.userData = {
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.005,
        y: (Math.random() - 0.5) * 0.005,
        z: (Math.random() - 0.5) * 0.005
      }
    };
    
    frames.add(frame);
  }
  
  scene.add(frames);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // Track mouse movement
  const mouse = { x: 0, y: 0 };
  
  document.addEventListener('mousemove', (event) => {
    // Normalize mouse coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Animate particles
    particles.children.forEach(particle => {
      particle.position.x += particle.userData.direction.x;
      particle.position.y += particle.userData.direction.y;
      particle.position.z += particle.userData.direction.z;
      
      // Wrap around edges
      if (particle.position.x > 5) particle.position.x = -5;
      if (particle.position.x < -5) particle.position.x = 5;
      if (particle.position.y > 5) particle.position.y = -5;
      if (particle.position.y < -5) particle.position.y = 5;
      if (particle.position.z > 5) particle.position.z = -5;
      if (particle.position.z < -5) particle.position.z = 5;
    });
    
    // Animate frames
    frames.children.forEach(frame => {
      frame.rotation.x += frame.userData.rotationSpeed.x;
      frame.rotation.y += frame.userData.rotationSpeed.y;
      frame.rotation.z += frame.userData.rotationSpeed.z;
    });
    
    // Mouse interaction with scene
    particles.rotation.y = mouse.x * 0.2;
    particles.rotation.x = mouse.y * 0.2;
    
    frames.rotation.y = mouse.x * 0.1;
    frames.rotation.x = mouse.y * 0.1;
    
    renderer.render(scene, camera);
  }
  
  // Start animation
  animate();
}

// Share options
const shareBtn = document.querySelector('.share-btn');
if (shareBtn) {
  shareBtn.addEventListener('click', () => {
    const url = imageUrlInput.value;
    
    if (navigator.share) {
      navigator.share({
        title: 'My Photo Booth Image',
        text: 'Check out my photo from the interactive photo booth!',
        url: url
      })
      .catch(err => {
        console.error('Share failed:', err);
        // Fallback - copy to clipboard
        copyToClipboard(url);
      });
    } else {
      // Fallback - copy to clipboard
      copyToClipboard(url);
    }
  });
}

// Copy URL to clipboard
function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  
  // Show feedback
  showError('URL copied to clipboard!');
}

// Detect theme if not specified
if (!document.body.className.includes('theme-')) {
  const hour = new Date().getHours();
  if (hour >= 17 || hour < 6) {
    // Evening/night theme
    document.body.classList.add('theme-party');
  } else {
    // Day theme
    document.body.classList.add('theme-wedding');
  }
}
});
