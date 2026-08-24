# Whiteout en el editor de texto PDF

El editor de texto PDF incluye la herramienta **Whiteout**, equivalente al borrador de Nitro PDF.

## Uso

1. Abre un PDF en el editor de texto.
2. Activa `Whiteout` en el panel lateral.
3. Arrastra sobre el contenido que quieras cubrir.
4. Repite el arrastre para crear más rectángulos.
5. Haz doble clic sobre un rectángulo para eliminarlo o usa `Clear Whiteout` para limpiar los rectángulos de la página actual.
6. Descarga una copia o aplica los cambios.

Los rectángulos se guardan en el JSON del editor y se dibujan como áreas blancas permanentes en el PDF exportado. El contenido original que queda debajo no es visible en el resultado exportado.

Las coordenadas de Whiteout usan el origen inferior izquierdo del PDF y se convierten desde la posición visual del lienzo. El índice de página usado por la interfaz es cero-based; el conversor del servidor conserva el orden normal del documento.
