/**
 * 할일 관리 애플리케이션 (통합 리팩토링 버전)
 * - 기능: 할일 CRUD, 할일 로그(히스토리), 파일 첨부, D-Day 알림, 엑셀 내보내기, 일괄 삭제
 * - 호환성: 로컬 파일(file://) 실행 환경 최적화
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. 상태 관리 & 초기화
    // ==========================================
    let todos = [];
    
    const ui = {
        input: document.getElementById('todo-input'),
        addBtn: document.getElementById('add-btn'),
        list: document.getElementById('todo-list'),
        emptyState: document.getElementById('empty-state'),
        dateDisplay: document.getElementById('date-display'),
        exportBtn: document.getElementById('export-btn'),
        clearBtn: document.getElementById('clear-completed-btn'),
        modal: null,
        modalImg: null
    };

    // 이미지 뷰어 모달 초기화
    initModal();
    // 날짜 표시 초기화
    updateDateDisplay();
    // 데이터 로드
    loadTodos();
    // 화면 렌더링
    renderTodos();

    // ==========================================
    // 2. 이벤트 리스너 등록
    // ==========================================
    ui.addBtn.addEventListener('click', addTodo);
    ui.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    ui.exportBtn.addEventListener('click', exportToCSV);
    ui.clearBtn.addEventListener('click', clearCompletedTodos);

    // ==========================================
    // 3. 핵심 로직
    // ==========================================

    function loadTodos() {
        try {
            const stored = localStorage.getItem('todos');
            if (stored) {
                todos = JSON.parse(stored);
                // 데이터 무결성 검사 및 보정 (구버전 호환)
                todos = todos.map(t => ({
                    id: t.id || Date.now(),
                    title: t.title || t.text || '제목 없음',
                    status: t.status || (t.completed ? '완료' : '진행중'),
                    dueDate: t.dueDate || null,
                    logs: Array.isArray(t.logs) ? t.logs : [{ 
                        date: new Date().toLocaleString('ko-KR'), 
                        action: '초기화', 
                        note: '데이터 복구됨' 
                    }]
                }));
            }
        } catch (e) {
            console.error("데이터 로드 실패:", e);
            todos = [];
        }
    }

    function saveTodos() {
        try {
            localStorage.setItem('todos', JSON.stringify(todos));
        } catch (e) {
            alert("저장 공간이 부족합니다. 사진을 줄이거나 불필요한 항목을 삭제해주세요.");
        }
    }

    // 스마트 날짜 파싱 (오늘, 금일, 내일, M월 D일, N일후)
    function parseSmartDate(text) {
        let title = text;
        let dueDate = null;
        let target = new Date(); // 오늘
        
        let found = false;

        // 패턴 0: 오늘/금일
        if (title.match(/오늘|금일/)) {
            dueDate = new Date();
            title = title.replace(/오늘|금일/g, '').trim();
            found = true;
        }
        
        // 패턴 1: M월 D일(까지)
        if (!found) {
            const matches = title.match(/(\d+)\s*월\s*(\d+)\s*일\s*(까지)?/);
            if (matches) {
                const m = parseInt(matches[1]) - 1;
                const d = parseInt(matches[2]);
                target.setMonth(m, d);
                // 만약 과거 날짜라면 내년으로 할지? (현재는 과거도 그대로 둠 -> D+N 으로 표시됨)
                dueDate = target;
                title = title.replace(matches[0], '').trim();
                found = true;
            }
        }

        // 패턴 2: N일 후/뒤
        if (!found) {
            const matches = title.match(/(\d+)\s*일\s*(후|뒤)/);
            if (matches) {
                const days = parseInt(matches[1]);
                target.setDate(target.getDate() + days);
                dueDate = target;
                title = title.replace(matches[0], '').trim();
                found = true;
            }
        }

        // 패턴 3: 내일/모레
        if (!found) {
            if (title.includes("내일")) {
                target.setDate(target.getDate() + 1);
                dueDate = target;
                title = title.replace("내일", '').trim();
                found = true;
            } else if (title.includes("모레")) {
                target.setDate(target.getDate() + 2);
                dueDate = target;
                title = title.replace("모레", '').trim();
                found = true;
            }
        }

        // 마감일 포맷팅 (YYYY-MM-DD)
        const dateStr = dueDate ? 
            `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}-${String(dueDate.getDate()).padStart(2,'0')}` 
            : null;

        return { title, dateStr };
    }

    function addTodo() {
        const rawText = ui.input.value.trim();
        if (!rawText) {
            alert("할 일을 입력해주세요.");
            return;
        }

        const { title, dateStr } = parseSmartDate(rawText);
        const nowStr = new Date().toLocaleString('ko-KR');

        const newTodo = {
            id: Date.now(),
            title: title || rawText, // 파싱 후 빈 문자열 되면 원본 사용
            status: '진행중', // 기본 상태
            dueDate: dateStr,
            logs: [{
                date: nowStr,
                action: '생성',
                note: dateStr ? `마감일 설정: ${dateStr}` : '신규 업무'
            }]
        };

        todos.unshift(newTodo);
        saveTodos();
        renderTodos();
        ui.input.value = '';
        ui.input.focus();
    }

    function clearCompletedTodos() {
        const completed = todos.filter(t => t.status === '완료');
        if (completed.length === 0) {
            alert("삭제할 완료된 항목이 없습니다.");
            return;
        }

        if (confirm(`완료된 항목 ${completed.length}개를 모두 삭제하시겠습니까?`)) {
            todos = todos.filter(t => t.status !== '완료');
            saveTodos();
            renderTodos();
        }
    }

    function exportToCSV() {
        if (todos.length === 0) {
            alert("내보낼 데이터가 없습니다.");
            return;
        }

        // CSV 헤더
        let csv = "\uFEFF날짜,D-Day,업무명,상태,로그일시,내용\n";
        
        todos.forEach(t => {
            const dDay = t.dueDate ? `마감:${t.dueDate}` : '-';
            const safeTitle = t.title.replace(/,/g, " ").replace(/[\r\n]+/g, " ");
            
            t.logs.forEach(log => {
                const safeNote = (log.note || "").replace(/,/g, " ").replace(/[\r\n]+/g, " ");
                const hasImg = log.image ? "(사진있음)" : "";
                // CSV 행 포맷
                csv += `${t.logs[0].date},${dDay},${safeTitle},${t.status},${log.date},${safeNote} ${hasImg}\n`;
            });
        });

        // 다운로드 실행 (로컬 호환성: encodeURIComponent 방식)
        const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
        
        const link = document.createElement("a");
        link.href = uri;
        link.style.display = "none";
        link.download = `업무일지_${new Date().toISOString().slice(0,10)}.csv`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ==========================================
    // 4. UI 렌더링 & 헬퍼
    // ==========================================

    function updateDateDisplay() {
        const now = new Date();
        ui.dateDisplay.textContent = now.toLocaleDateString('ko-KR', { 
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
        });
    }

    function initModal() {
        const div = document.createElement('div');
        div.className = 'image-modal';
        div.style.display = 'none';
        div.innerHTML = '<img class="modal-content" id="modal-img-tag">';
        div.addEventListener('click', () => div.style.display = 'none');
        document.body.appendChild(div);
        
        ui.modal = div;
        ui.modalImg = div.querySelector('img');
    }

    window.openImage = (dataSrc) => {
        if (ui.modal && ui.modalImg) {
            ui.modalImg.src = dataSrc;
            ui.modal.style.display = 'flex';
        }
    };

    // 전역 함수로 노출 (onclick 핸들러용)
    window.deleteItem = (id) => {
        if (confirm("이 항목을 정말 삭제하시겠습니까?")) {
            todos = todos.filter(t => t.id !== id);
            saveTodos();
            renderTodos();
        }
    };

    window.toggleItemStatus = (id) => {
        const t = todos.find(item => item.id === id);
        if (t) {
            const wasDone = t.status === '완료';
            t.status = wasDone ? '진행중' : '완료';
            addLogInternal(t, wasDone ? '재진행' : '완료', wasDone ? '다시 진행함' : '완료 처리함');
            saveTodos();
            renderTodos();
        }
    };

    window.toggleTimelineArea = (id) => {
        const area = document.getElementById(`timeline-${id}`);
        const icon = document.getElementById(`chevron-${id}`);
        if (!area) return;
        
        if (area.style.display === 'block') {
            area.style.display = 'none';
            if(icon) icon.className = "fas fa-chevron-down";
        } else {
            area.style.display = 'block';
            if(icon) icon.className = "fas fa-chevron-up";
        }
    };

    window.submitLog = async (id) => {
        const noteInput = document.getElementById(`note-${id}`);
        const fileInput = document.getElementById(`file-${id}`);
        if (!noteInput) return;

        const rawNote = noteInput.value.trim();
        const file = fileInput && fileInput.files[0];

        if (!rawNote && !file) {
            alert("내용이나 사진을 입력해주세요.");
            return;
        }

        const t = todos.find(item => item.id === id);
        if (!t) return;

        let imgData = null;
        if (file) {
            try {
                imgData = await compressImage(file);
            } catch (err) {
                alert("이미지 처리 실패");
                return;
            }
        }

        // [New] 로그 내용에서 날짜 파싱하여 마감일 업데이트
        let finalNote = rawNote;
        let actionParams = '기록';
        
        if (rawNote) {
            const { title: parsedText, dateStr } = parseSmartDate(rawNote);
            if (dateStr) {
                // 날짜가 발견되면 마감일 업데이트
                if (t.dueDate !== dateStr) {
                    t.dueDate = dateStr;
                    finalNote = `${parsedText} (마감일 변경됨)`;
                    actionParams = '일정변경';
                } else {
                    finalNote = parsedText;
                }
            }
        }

        addLogInternal(t, actionParams, finalNote, imgData);
        saveTodos();
        renderTodos();
        
        // 입력창 초기화
        noteInput.value = '';
        if (fileInput) fileInput.value = '';
    };

    function addLogInternal(todo, action, note, img = null) {
        todo.logs.push({
            date: new Date().toLocaleString('ko-KR'),
            action: action,
            note: note,
            image: img
        });
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;
                    const MAX = 800; // 최대 800px

                    if (w > h && w > MAX) { h *= MAX/w; w = MAX; }
                    else if (h > w && h > MAX) { w *= MAX/h; h = MAX; }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
            };
            reader.onerror = reject;
        });
    }

    function getDDayLabel(dateStr) {
        if (!dateStr) return null;
        const now = new Date();
        now.setHours(0,0,0,0);
        const due = new Date(dateStr);
        due.setHours(0,0,0,0);

        const diff = (due - now) / (1000 * 60 * 60 * 24); // 일 단위 차이

        if (diff === 0) return { text: "D-Day", color: "red", urgent: true };
        if (diff > 0 && diff <= 3) return { text: `D-${diff}`, color: "orange", urgent: false };
        if (diff > 3) return { text: `D-${diff}`, color: "green", urgent: false };
        if (diff < 0) return { text: `D+${Math.abs(diff)}`, color: "gray", urgent: false };
        
        // 내일(D-1)은 D-1로 명시
        if (diff === 1) return { text: "D-1", color: "red", urgent: true };

        return { text: `D-${diff}`, color: "green", urgent: false }; 
    }

    function renderTodos() {
        ui.list.innerHTML = '';
        if (todos.length === 0) {
            ui.emptyState.style.display = 'block';
            return;
        }
        ui.emptyState.style.display = 'none';

        // 정렬: 마감일 급한 순 -> 날짜 없는 거 -> 완료된 거 맨 뒤
        const sorted = [...todos].sort((a, b) => {
            if (a.status === '완료' && b.status !== '완료') return 1;
            if (a.status !== '완료' && b.status === '완료') return -1;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });

        sorted.forEach(t => {
            const isDone = t.status === '완료';
            const dDay = getDDayLabel(t.dueDate);
            
            let badgeHtml = '';
            if (dDay && !isDone) {
                const styleClass = dDay.color === 'red' ? 'd-day-urgent' : 
                                   dDay.color === 'orange' ? 'd-day-warning' : 
                                   dDay.color === 'gray' ? 'd-day-past' : 'd-day-normal';
                badgeHtml = `<span class="d-day-badge ${styleClass}">${dDay.text}</span>`;
            }

            const logsHtml = t.logs.map(log => `
                <div class="log-entry">
                    <div class="log-date">${log.date} <span style="font-weight:bold; color:#6a11cb;">[${log.action}]</span></div>
                    <div class="log-content">
                        ${log.note ? `<p>${log.note}</p>` : ''}
                        ${log.image ? `<img src="${log.image}" class="attachment-thumbnail" onclick="openImage('${log.image}')">` : ''}
                    </div>
                </div>
            `).join('');

            const el = document.createElement('li');
            el.className = 'todo-container';
            el.innerHTML = `
                <div class="todo-header" onclick="toggleTimelineArea(${t.id})">
                    <div class="todo-status ${isDone ? 'status-done' : 'status-check'}">
                        ${t.status}
                    </div>
                    <div class="todo-title" style="${isDone ? 'text-decoration:line-through; color:#aaa;' : ''}">
                        ${badgeHtml} ${t.title}
                    </div>
                    <i id="chevron-${t.id}" class="fas fa-chevron-down" style="color:#aaa;"></i>
                    
                    <div class="action-buttons-group" style="margin-left: auto; display: flex; gap: 5px;">
                        <!-- 개별 저장 버튼 -->
                        <button class="action-btn save-btn" onclick="event.stopPropagation(); saveSingleTodo(${t.id})" title="이 항목만 저장">
                            <i class="fas fa-save"></i>
                        </button>
                        <!-- 개별 삭제 버튼 -->
                        <button class="action-btn delete-btn" data-id="${t.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>

                <div id="timeline-${t.id}" class="timeline-area" style="display:none;">
                    <div class="logs-container">
                        ${logsHtml}
                    </div>
                    <div class="add-log-box">
                        <input type="text" id="note-${t.id}" class="log-input" placeholder="메모 입력...">
                        <label class="file-upload-label">
                            <input type="file" id="file-${t.id}" class="file-upload-input" accept="image/*">
                            <i class="fas fa-camera"></i>
                        </label>
                        <button class="log-btn" onclick="submitLog(${t.id})">기록</button>
                    </div>
                    <div style="margin-top:10px; text-align:right;">
                        <button style="border:none; background:none; cursor:pointer; color:${isDone?'#2ecc71':'#aaa'};" onclick="toggleItemStatus(${t.id})">
                            <i class="fas ${isDone ? 'fa-undo' : 'fa-check'}"></i> ${isDone ? '다시 진행하기' : '완료 처리'}
                        </button>
                    </div>
                </div>
            `;
            ui.list.appendChild(el);
        });

        // [New] 이벤트 리스너 동적 할당 (인라인 onclick 문제 해결)
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // 부모(todo-header) 클릭 이벤트 전파 중단
                const id = parseInt(btn.getAttribute('data-id'));
                deleteItem(id);
            });
        });
    }

    // ==========================================
    // 5. 데이터 백업 및 복구 (Phase 9 & 9.5)
    // ==========================================
    const backupBtn = document.getElementById('backup-btn');
    const restoreBtn = document.getElementById('restore-btn');
    const restoreInput = document.getElementById('restore-input');

    // 개별 항목 백업 함수 (전역 노출 필요)
    window.saveSingleTodo = function(id) {
        const todo = todos.find(t => t.id === id);
        if (!todo) return;
        
        // 배열 형태로 감싸서 저장 (복구 로직 통일성을 위해)
        const dataStr = JSON.stringify([todo], null, 2);
        downloadJSON(dataStr, `할일_${todo.title.substring(0, 10).replace(/[/\\?%*:|"<>]/g, '_')}_${new Date().toISOString().slice(0,10)}.json`);
    };

    function downloadJSON(dataStr, fileName) {
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    if (backupBtn) {
        backupBtn.addEventListener('click', () => {
            if (todos.length === 0) {
                alert("저장할 데이터가 없습니다.");
                return;
            }
            const dataStr = JSON.stringify(todos, null, 2);
            downloadJSON(dataStr, `전체할일백업_${new Date().toISOString().slice(0,10)}.json`);
            alert("전체 데이터가 백업되었습니다.");
        });
    }

    if (restoreBtn && restoreInput) {
        restoreBtn.addEventListener('click', () => {
            if (confirm("파일을 불러와서 현재 목록에 추가(병합)하시겠습니까?\n(중복된 항목은 최신 내용으로 업데이트됩니다.)")) {
                restoreInput.click();
            }
        });

        restoreInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const loadedData = JSON.parse(event.target.result);
                    let newItems = [];
                    
                    // 배열인지 단일 객체인지 확인하여 정규화
                    if (Array.isArray(loadedData)) {
                        newItems = loadedData;
                    } else if (typeof loadedData === 'object' && loadedData !== null) {
                        newItems = [loadedData];
                    } else {
                        throw new Error("올바르지 않은 데이터 형식");
                    }

                    let addedCount = 0;
                    let updatedCount = 0;

                    newItems.forEach(newItem => {
                        // 유효성 검사 (ID, Title 필수)
                        if (!newItem.id || !newItem.title) return;

                        const existingIndex = todos.findIndex(t => t.id === newItem.id);
                        if (existingIndex !== -1) {
                            // 이미 존재하면 업데이트 (선택 사항: 사용자에게 물어볼 수도 있으나 편의상 덮어쓰기)
                            todos[existingIndex] = newItem;
                            updatedCount++;
                        } else {
                            // 없으면 추가
                            todos.unshift(newItem);
                            addedCount++;
                        }
                    });

                    saveTodos();
                    renderTodos();
                    alert(`복구 완료!\n- 추가된 항목: ${addedCount}개\n- 업데이트된 항목: ${updatedCount}개`);

                } catch (err) {
                    alert("파일을 읽을 수 없습니다. 올바른 백업 파일인지 확인해주세요.");
                    console.error(err);
                }
                // 입력 초기화
            };
            reader.readAsText(file);
        });
    }

    // ==========================================
    // 6. 음성 비서 (Phase 10)
    // ==========================================
    const voiceBtn = document.getElementById('voice-btn');
    
    // Web Speech API 지원 여부 확인
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition && voiceBtn) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'ko-KR'; // 한국어 설정
        recognition.interimResults = false; // 중간 결과 대신 최종 결과만
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            voiceBtn.classList.add('listening');
        };

        recognition.onend = () => {
            voiceBtn.classList.remove('listening');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            
            // 기존 입력값이 있으면 뒤에 이어붙이기
            const currentVal = ui.input.value;
            ui.input.value = currentVal ? `${currentVal} ${transcript}` : transcript;
            ui.input.focus();
        };

        recognition.onerror = (event) => {
            console.error('음성 인식 오류:', event.error);
            voiceBtn.classList.remove('listening');
            if (event.error === 'not-allowed') {
                alert("마이크 사용 권한이 필요합니다.");
            }
        };

        voiceBtn.addEventListener('click', () => {
            // 이미 듣고 있다면 멈춤, 아니면 시작
            if (voiceBtn.classList.contains('listening')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    } else {
        // 미지원 브라우저 처리
        if (voiceBtn) {
            voiceBtn.style.display = 'none';
        }
    }
});
