import { forwardRef, ForwardedRef, FormEvent } from 'react';

import styles from "./InputField.module.css";

function InputField(_props: {}, inputRef: ForwardedRef<HTMLInputElement>) {
    function onChange(e: FormEvent<HTMLInputElement>) {
        const files = (e.target as HTMLInputElement).files;
        if(files) {
            const filesArray: File[] = Array.from(files as any);
            for (let i = 0; i < files.length; i++) {
                const file = filesArray[i];
                if(file) {
                    console.log(file.name);
                }
                else
                    throw new Error("This should not happen. Contact maintainers.");
            }
        }
    }

    return (
        <label className={styles.custom_file_upload}>
            <input onChange={onChange} type="file" id="pdfFile" accept=".pdf" multiple ref={inputRef}/>
            Upload your PDF(s)!
        </label>
    )
}

export default forwardRef(InputField);