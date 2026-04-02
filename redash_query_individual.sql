-- =====================================================
-- [Redash 쿼리 2] 수강생 개인별 챕터별 NPS 원본 데이터
-- 용도: 이탈위험/즉각대응 감지, 히트맵, 개인 추이 분석
-- =====================================================

with nps_raw as (select DISTINCT
    case
        when nbcap.round.title::varchar is null then null
        when nbcap.round.title::varchar like '앱 개발자 양성과정(주특기 미정) %' then '미정'
        when nbcap.round.title::varchar like '웹개발 엔지니어 양성과정(주특기 미정) %' then '미정'
        when nbcap.round.title::varchar like 'AI/클라우드/게임 개발자 양성과정(주특기 미정) %' then '미정'
        when nbcap.round.title::varchar like 'KDT 빅데이터 기반 품질 관리(QA,QC) 양성 과정 %' then 'QAQC'
        when nbcap.round.title::varchar like 'KDT 생성형 AI를 활용한 데이터드리븐 프로덕트 매니저 양성과정 %' then 'PM'
        when nbcap.round.title::varchar like 'KDT 실무형 데이터 분석가 양성과정 %' then 'data'
        when nbcap.round.title::varchar like 'KDT 실무형 스프링 백엔드 엔지니어 양성과정 %' then 'WEB(Spring)'
        when nbcap.round.title::varchar like 'KDT 실무형 클라우드 엔지니어 양성과정 %' then 'cloud'
        when nbcap.round.title::varchar like 'KDT 실무형 AI 웹 개발자 양성과정 %' then 'AI'
        when nbcap.round.title::varchar like 'KDT 실무형 Android 앱개발자 양성과정 %' then 'APP(Android)'
        when nbcap.round.title::varchar like 'KDT 실무형 iOS 앱 개발자 양성과정 %' then 'APP(iOS)'
        when nbcap.round.title::varchar like 'KDT 실무형 Kotlin & Spring 개발자 양성과정 %' then 'kotlin'
        when nbcap.round.title::varchar like 'KDT 실무형 Node.js 백엔드 엔지니어 양성과정 %' then 'WEB(Node)'
        when nbcap.round.title::varchar like 'KDT 실무형 Nodejs 백엔드 엔지니어 양성과정 %' then 'WEB(Node)'
        when nbcap.round.title::varchar like 'KDT 실무형 Unity 게임개발자 양성과정 %' then 'Game'
        when nbcap.round.title::varchar like 'KDT 실무형 UX/UI 디자이너 양성과정 %' then 'UXUI'
        when nbcap.round.title::varchar like 'KDT 실무형AI웹개발자 %' then 'AI'
        when nbcap.round.title::varchar like 'KDT 심화_AI를 활용한 백엔드 아키텍처 심화 과정 %' then 'advanced-java'
        when nbcap.round.title::varchar like 'KDT 앱 제작 실무과정 %' then 'APP(Android)'
        when nbcap.round.title::varchar like 'KDT Unreal 기반 3D 게임 개발자 양성과정 %' then 'Unreal'
        when nbcap.round.title::varchar like 'KDT 실무형 프론트엔드 엔지니어 양성과정 %'
            and REGEXP_SUBSTR(json_extract_path_text(JSON_SERIALIZE(nbcap.round), 'title'), '...$') = '8회차' then 'PD'
        when nbcap.round.title::varchar like 'KDT 실무형 프론트엔드 엔지니어 양성과정 %' then 'WEB(React)'
        -- [신규 트랙 추가 시 여기에 WHEN 구문 추가]
        when nbcap.round.title::varchar like 'KDT 생성형 AI 기반 그래픽 디자이너 양성 과정 %' then 'AI_Graphic'
    end as 트랙,
    case
        when nbcap.round is null then ''
        when 트랙 = 'UXUI' and REGEXP_SUBSTR(json_extract_path_text(JSON_SERIALIZE(nbcap.round), 'title'), '...$') = '2회차' then '1회차'
        when 트랙 = 'Unreal' and REGEXP_SUBSTR(json_extract_path_text(JSON_SERIALIZE(nbcap.round), 'title'), '...$') = '2회차' then '1회차'
        when nbcap.round.title::varchar like 'KDT 실무형 프론트엔드 엔지니어 양성과정 %'
            and REGEXP_SUBSTR(json_extract_path_text(JSON_SERIALIZE(nbcap.round), 'title'), '...$') = '8회차' then '1회차'
        else REGEXP_SUBSTR(json_extract_path_text(JSON_SERIALIZE(nbcap.round), 'title'), '...$')
    end as 회차,

    nbcmy.username                  as 이름,
    nbcmy.chaptertitle              as 챕터명,
    nbcmy.satisfaction              as 만족도,
    nbcmy.difficulty                as 난이도,
    nbcmy.promoterscore             as nps,
    nbcmy.satisfactioncomment       as 만족도코멘트,
    nbcmy.npscomment                as nps코멘트,
    case
        when nbcmy.promoterscore > 8                                    then '상방'
        when nbcmy.promoterscore > 6 AND nbcmy.promoterscore < 9        then '중방'
        when nbcmy.promoterscore >= 0 AND nbcmy.promoterscore < 7       then '하방'
        else '미제출'
    end                             as 그룹,
    DATE(nbcmy.chapterstartdate)    as 시작일,
    DATE(nbcmy.chapterenddate)      as 종료일

from dbnbcamp_evaluations_users nbcmy

left join dbnbcamp_evaluations nbcev
    on nbcev.touserid       = nbcmy.userid
    and nbcev.fromuserid    = nbcmy.userid
    and nbcev.roundchapterid = nbcmy.roundchapterid

left join dbnbcamp_enrolleds nbcen
    on nbcen.userid = nbcev.fromuserid

left join dbnbcamp_applicants nbcap
    on nbcap.user.onlineuserid = nbcmy.userid

where
    트랙 is not null
    and 회차 is not null
    and (
        nbcap.funnel.title = 'HRD등록완료'
        or nbcap.funnel.title = '서류합격'
        or nbcap.funnel.title like '서류 합격%'
        or nbcap.funnel.title = '슬랙가입완료'
        or nbcap.funnel.title = '사전캠프 참여'
        or nbcap.funnel.title = '지원 철회'
        or nbcap.funnel.title = '지원 철회요청'
        or nbcap.funnel.title = '취업 모수 제외'
        or nbcap.funnel.title = '취업 준비중'
        or nbcap.funnel.title = '취업보류'
        or nbcap.funnel.title = '취업완료'
        or nbcap.funnel.title like '최종%'
    )
)

select
    트랙,
    회차,
    이름,
    챕터명,
    만족도,
    난이도,
    nps,
    그룹,
    만족도코멘트,
    nps코멘트,
    -- 트랙+회차+이름 내에서 시작일 순 챕터 번호
    ROW_NUMBER() OVER (
        PARTITION BY 트랙, 회차, 이름
        ORDER BY 시작일 ASC
    )                               as CH,
    시작일,
    종료일

from nps_raw
where 트랙 is not null
order by 트랙, 회차, 이름, 시작일
