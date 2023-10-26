import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonButton } from '@ionic/react';
import './Home.css';
import { rotatePages } from '../utils/pdf-operations.js';

import { FilePicker } from '@capawesome/capacitor-file-picker';

console.log(rotatePages);
async function rotate90() {
  console.log("Test rotate 90 with Button Click");

  const pickedFiles = await FilePicker.pickFiles({
    types: ['application/pdf'],
    multiple: false,
  });
  const file = pickedFiles.files[0];
  
  const buffer = await file.blob?.arrayBuffer();
  if (!buffer) return;
  
  const rotated = await rotatePages(buffer, 90)

  console.log(rotated);
}


const Home: React.FC = () => {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Blank</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Blank</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonButton onClick={rotate90}>Rotate 90</IonButton>
      </IonContent>
    </IonPage>
  );
};

export default Home;
