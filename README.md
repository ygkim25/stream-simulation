1. gradle.properties : 자바 17 경로 확인
    - org.gradle.java.home=C:\\wemb\\java\\jdk-17   

2. application.properties 설정
   - src/resource/application.properties
   - application.properties.example 파일 복사 후 >> application.properties << 저장

3. 로컬 백엔드 톰캣 포트 : 8086번 / localhost:8086

4. module 설치
   - cd demo/frontend
   - npm install

5. 백엔드 DB 연결 확인
   - src/resource/application.properties
   - spring.datasource.url=jdbc:postgresql://10.23.128.46:5434

6. vscode 자바 17 적용
   - demo/.vscode에 settings.json 파일 생성
   - 아래 코드 붙여넣기
   - { // 자바 17 경로 bin폴더 앞까지 
      "java.import.gradle.java.home": "C:\\wemb\\java\\jdk-17",
      "java.configuration.updateBuildConfiguration": "interactive"
      }

7. 스프링 부트 확장 팩 설치
   - vscode 확장:마켓플레이스 > Spring Boot Extension Pack 설치
