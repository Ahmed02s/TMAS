import urllib.request, json
ids=[4,5,6]
origin='http://localhost:8443'
for i in ids:
    try:
        req=urllib.request.Request(f'http://127.0.0.1:8000/api/quizzes/{i}'); req.add_header('Origin', origin); r=urllib.request.urlopen(req, timeout=10); obj=json.load(r)
    except Exception as e:
        print('Failed fetch', i, e); continue
    quiz=obj.get('quiz') or obj
    questions=obj.get('questions') or []
    tier=quiz.get('tier') or 'Foundational'
    course=quiz.get('course') or 'Unknown'
    title=f"AI Generated {tier} Quiz for {course}"
    payload={'title':title,'course':course,'questions':[{'question':q.get('question',''),'options':q.get('options',[]),'answer':q.get('correct','')} for q in questions],'passing_score':quiz.get('passing_score') or 60,'attempts':quiz.get('attempts') or 1,'due_date':quiz.get('due_date'),'difficulty':quiz.get('difficulty'),'tier':tier,'open_date':quiz.get('open_date'),'close_date':quiz.get('close_date'),'material_ids':quiz.get('material_ids') or []}
    data=json.dumps(payload).encode()
    p=urllib.request.Request('http://127.0.0.1:8000/api/quizzes/publish', data=data, headers={'Content-Type':'application/json','Origin':origin})
    try:
        resp=urllib.request.urlopen(p, timeout=10); print('Published corrected title for', i, resp.status, resp.read().decode())
    except Exception as e:
        print('Publish failed for', i, e)
