import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonButton } from '@ionic/react';
import ExploreContainer from '../components/ExploreContainer';
import './Home.css';
import "../../../server-node/public/wasm/pdfcpu-wrapper-browser.js"
import { splitPDF } from '../utils/pdf-operations.js';

import { FilePicker } from '@capawesome/capacitor-file-picker';

async function testFunction() {
    console.log("Test Function for Button Click");
    console.log(splitPDF);

    const result = await FilePicker.pickFiles({
        types: ['application/pdf'],
        multiple: true,
    });

    console.log(result);
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
        <IonButton onClick={testFunction}>Default</IonButton>
      </IonContent>
    </IonPage>
  );
};

export default Home;
