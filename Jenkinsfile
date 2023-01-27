pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
				sh 'chmod 755 gradlew'
                sh './gradlew build'
            }
        }
        stage('Docker Build') {
            steps {
                script {
                    def appVersion = sh(returnStdout: true, script: './gradlew printVersion -q').trim()
                    def image = "frooodle/s-pdf:$appVersion"
                    sh "docker build -t $image ."
                }
            }
        }
        stage('Docker Push') {
            steps {
                script {
                    def appVersion = sh(returnStdout: true, script: './gradlew printVersion -q').trim()
                    def image = "frooodle/s-pdf:$appVersion"
                    withCredentials([string(credentialsId: 'docker_hub_access_token', variable: 'DOCKER_HUB_ACCESS_TOKEN')]) {
				sh "docker login --username frooodle --password $DOCKER_HUB_ACCESS_TOKEN"
                        sh "docker push $image"
                    }
                }
            }
    	
	}
   }
}