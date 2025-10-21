# TODO: Upgrade Facial Recognition System to Meet Guide Requirements

## Step 1: Update Dependencies
- Update requirements.txt to include TensorFlow, Keras, scikit-learn, MTCNN, Pillow.

## Step 2: Download Facenet Model
- Add code to download pre-trained Facenet model (Keras .h5 file) if not present.

## Step 3: Modify Backend (app.py)
- Replace face_recognition with Facenet for embeddings.
- Implement preprocessing (resize, normalize).
- Use MTCNN for face detection and alignment.
- Implement SVM classifier for recognition.
- Update registration to collect embeddings and train SVM.
- Update recognition to use SVM prediction.

## Step 4: Test Backend
- Run the app and test registration/recognition.

## Step 5: Evaluate Performance
- Add basic evaluation (accuracy on test data).

## Step 6: Final Integration
- Ensure frontend works with updated backend.
