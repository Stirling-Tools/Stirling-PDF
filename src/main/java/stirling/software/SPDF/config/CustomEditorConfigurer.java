package stirling.software.SPDF.config;
import java.beans.PropertyEditor;

import org.springframework.beans.BeansException;
import org.springframework.beans.PropertyEditorRegistrar;
import org.springframework.beans.PropertyEditorRegistry;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.validation.DataBinder;

public class CustomEditorConfigurer implements BeanPostProcessor {

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
        if (bean instanceof PropertyEditorRegistrar) {
            ((PropertyEditorRegistrar) bean).registerCustomEditors(new PropertyEditorRegistry() {
                @Override
                public void registerCustomEditor(Class<?> requiredType, String propertyPath, java.beans.PropertyEditor propertyEditor) {
                    DataBinder dataBinder = new DataBinder(bean);
                    dataBinder.registerCustomEditor(requiredType, propertyPath, propertyEditor);
                }

                @Override
                public void registerCustomEditor(Class<?> requiredType, java.beans.PropertyEditor propertyEditor) {
                    DataBinder dataBinder = new DataBinder(bean);
                    dataBinder.registerCustomEditor(requiredType, propertyEditor);
                }

				@Override
				public PropertyEditor findCustomEditor(Class<?> requiredType, String propertyPath) {
					return null;
				}
            });
        }

        return bean;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
        return bean;
    }
}
