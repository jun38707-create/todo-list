document.addEventListener('DOMContentLoaded', () => {
    // DOM 요소 선택
    const todoInput = document.getElementById('todo-input');
    const addBtn = document.getElementById('add-btn');
    const todoList = document.getElementById('todo-list');
    const emptyState = document.getElementById('empty-state');
    const dateDisplay = document.getElementById('date-display');
    const exportBtn = document.getElementById('export-btn');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');

    // 이미지 모달
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = '<img class="modal-content" id="modal-img">';
    document.body.appendChild(modal);
    modal.addEventListener('click', () => modal.style.display = 'none');

    function openModal(src) {
        document.getElementById('modal-img').src = src;
        modal.style.display = 'flex';
    }

    // 날짜 표시
    function updateDate() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        dateDisplay.textContent = now.toLocaleDateString('ko-KR', options);
    }
    updateDate();

    // 데이터 로드
    let todos = loadTodos();

    function loadTodos() {
        const stored = localStorage.getItem('todos');
        if (!stored) return [];
        try {
            const parsed = JSON.parse(stored);
            if (parsed.length > 0 && !parsed[0].logs) {
                return parsed.map(item => ({
                    id: item.id,
                    title: item.text,
                    status: item.completed ? '완료' : '진행중',
                    dueDate: null, // 기존 데이터는 마감일 없음
                    logs: [{ date: new Date(item.id).toLocaleString('ko-KR'), action: '생성 (자동변환)', note: '기존 데이터' }]
                }));
            }
            return parsed;
        } catch (e) {
            return [];
        }
    }

    renderTodos();

    // 이벤트 리스너
    addBtn.addEventListener('click', addTodo);
    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    exportBtn.addEventListener('click', exportToCSV);
    clearCompletedBtn.addEventListener('click', clearCompletedTodos);

    // [Core] 스마트 날짜 파싱 (자연어 처리)
    function parseDateFromText(text) {
        let title = text;
        let dueDate = null;
        let targetDate = new Date(); // 오늘

        // 1. "M월 D일" 또는 "M월 D일까지" 패턴 (예: 1월 15일, 2월 8일까지)
        // 공백 허용: 1월15일, 1 월 15 일 등
        const monthDayMatch = text.match(/(\d+)\s*월\s*(\d+)\s*일\s*(까지)?/);

        if (monthDayMatch) {
            const month = parseInt(monthDayMatch[1]);
            const day = parseInt(monthDayMatch[2]);
            const currentYear = targetDate.getFullYear();

            // 월은 0부터 시작하므로 -1
            targetDate.setFullYear(currentYear, month - 1, day);
            
            // 만약 입력한 날짜가 과거라면 (예: 5월에 '1월 1일' 입력), 그냥 과거 날짜로 둠 (D+ 표시됨)
            // 사용자 의도가 '내년'일 수도 있지만, 보통은 실수를 바로잡거나 과거 기록용이므로 자동 보정은 하지 않음.
            
            dueDate = targetDate;
            // "1월 15일까지" 부분을 제거
            title = text.replace(monthDayMatch[0], '').trim();
        }
        // 2. "N일후", "N일뒤" 패턴 (예: 3일후)
        else {
            const daysAfterMatch = text.match(/(\d+)일\s*(후|뒤)/);
            if (daysAfterMatch) {
                const days = parseInt(daysAfterMatch[1]);
                targetDate.setDate(targetDate.getDate() + days);
                dueDate = targetDate;
                title = text.replace(daysAfterMatch[0], '').trim();
            }
            // 3. "내일" 패턴
            else if (text.includes("내일")) {
                targetDate.setDate(targetDate.getDate() + 1);
                dueDate = targetDate;
                title = text.replace("내일", '').trim();
            }
            // 4. "모레" 패턴
            else if (text.includes("모레")) {
                targetDate.setDate(targetDate.getDate() + 2);
                dueDate = targetDate;
                title = text.replace("모레", '').trim();
            }
        }

        // 날짜 포맷팅 (YYYY-MM-DD)
        const formattedDueDate = dueDate ? dueDate.toISOString().split('T')[0] : null;
        return { title, dueDate: formattedDueDate };
    }

    // [Core] D-Day 계산
    function getDDay(dueDateString) {
        if (!dueDateString) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDateString);
        due.setHours(0, 0, 0, 0);

        const diffTime = due - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return { label: 'D-Day', class: 'd-day-urgent' };
        if (diffDays === 1) return { label: 'D-1', class: 'd-day-urgent' };
        if (diffDays > 0 && diffDays <= 3) return { label: `D-${diffDays}`, class: 'd-day-warning' };
        if (diffDays > 3) return { label: `D-${diffDays}`, class: 'd-day-normal' };
        if (diffDays < 0) return { label: `D+${Math.abs(diffDays)}`, class: 'd-day-past' };
        
        return null;
    }

    // [Core] 업무 추가
    function addTodo() {
        const rawText = todoInput.value.trim();
        if (rawText === '') {
            alert('업무 내용을 입력해주세요!');
            return;
        }

        // 스마트 파싱 실행
        const { title, dueDate } = parseDateFromText(rawText);

        const now = new Date();
        const formattedDate = now.toLocaleString('ko-KR');

        const newTodo = {
            id: Date.now(),
            title: title,
            status: '진행중',
            dueDate: dueDate, // 마감일 저장
            logs: [{
                date: formattedDate,
                action: '생성',
                note: dueDate ? `마감일 자동 설정: ${dueDate}` : '신규 업무 등록'
            }]
        };

        todos.unshift(newTodo);
        saveTodos();
        renderTodos();
        todoInput.value = '';
        todoInput.focus();
    }

    // 나머지 Core 함수들 (save, delete, toggleStatus) 유지
    function clearCompletedTodos() {
        const completedCount = todos.filter(t => t.status === '완료').length;
        if (completedCount === 0) {
            alert('완료된 항목이 없습니다.');
            return;
        }
        if (confirm(`완료된 업무 ${completedCount}건을 모두 삭제하시겠습니까?`)) {
            todos = todos.filter(t => t.status !== '완료');
            saveTodos();
            renderTodos();
        }
    }

    window.deleteTodo = (id) => {
        if (confirm('삭제하시겠습니까?')) {
            todos = todos.filter(todo => todo.id !== id);
            saveTodos();
            renderTodos();
        }
    };

    window.toggleStatus = (id) => {
        const work = todos.find(t => t.id === id);
        if (work) {
            const isComplete = work.status === '완료';
            work.status = isComplete ? '진행중' : '완료';
            addLogInternal(work, isComplete ? '재진행' : '완료', isComplete ? '상태 변경' : '완료 처리');
            saveTodos();
            renderTodos();
        }
    };

    // [Core] 로그/파일 추가 (이전과 동일)
    window.addLog = async (id) => {
        const input = document.getElementById(`log-input-${id}`);
        const fileInput = document.getElementById(`log-file-${id}`);
        const note = input.value.trim();
        const file = fileInput.files[0];

        if (!note && !file) {
            alert("내용을 입력하거나 파일을 선택해주세요.");
            return;
        }
        const work = todos.find(t => t.id === id);
        if (!work) return;

        let imageData = null;
        if (file) {
            try {
                imageData = await resizeImage(file);
            } catch (err) {
                alert('이미지 처리 오류: ' + err.message);
                return;
            }
        }
        addLogInternal(work, '업데이트', note, imageData);
        input.value = '';
        fileInput.value = '';
        saveTodos();
        renderTodos();
    };

    function resizeImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7)); 
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    function addLogInternal(workObj, action, note, image = null) {
        const now = new Date();
        workObj.logs.push({
            date: now.toLocaleString('ko-KR'),
            action: action,
            note: note,
            image: image
        });
    }

    window.toggleTimeline = (id) => {
        const timeline = document.getElementById(`timeline-${id}`);
        const icon = document.getElementById(`icon-${id}`);
        if (timeline.style.display === 'block') {
            timeline.style.display = 'none';
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            timeline.style.display = 'block';
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    };

    window.viewImage = (btn) => {
        const src = btn.dataset.src;
        if(src) openModal(src);
    };

    // [UI] 렌더링 (D-Day 배지 추가)
    function renderTodos() {
        todoList.innerHTML = '';
        if (todos.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            // 날짜순 정렬 (마감일 임박한 순)
            todos.sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            });

            todos.forEach(todo => {
                // D-Day 계산
                const dDayInfo = getDDay(todo.dueDate);
                const dDayBadge = dDayInfo ? `<span class="d-day-badge ${dDayInfo.class}">${dDayInfo.label}</span>` : '';

                const logsHtml = todo.logs.map(log => `
                    <div class="log-entry">
                        <div class="log-date">${log.date} <span style="font-weight:bold; color:#6a11cb;">[${log.action}]</span></div>
                        <div class="log-content">
                            ${log.note ? `<p>${log.note}</p>` : ''}
                            ${log.image ? `<img src="${log.image}" class="attachment-thumbnail" onclick="viewImage(this)" data-src="${log.image}" title="클릭하여 확대">` : ''}
                        </div>
                    </div>
                `).join('');

                const li = document.createElement('li');
                li.className = 'todo-container';
                const isDone = todo.status === '완료';

                li.innerHTML = `
                    <div class="todo-header" onclick="toggleTimeline(${todo.id})">
                        <div class="todo-status ${isDone ? 'status-done' : 'status-check'}">
                            ${todo.status}
                        </div>
                        <div class="todo-title" style="${isDone ? 'text-decoration: line-through; color: #999;' : ''}">
                            ${dDayBadge} ${todo.title}
                        </div>
                        <i id="icon-${todo.id}" class="fas fa-chevron-down" style="color:#aaa;"></i>
                        <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteTodo(${todo.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div id="timeline-${todo.id}" class="timeline-area">
                        <div class="logs-container">${logsHtml}</div>
                        <div class="add-log-box">
                            <input type="text" id="log-input-${todo.id}" class="log-input" placeholder="진행 상황 입력...">
                            <label class="file-upload-label"><input type="file" id="log-file-${todo.id}" class="file-upload-input" accept="image/*"><i class="fas fa-camera"></i></label>
                            <button class="log-btn" onclick="addLog(${todo.id})">기록</button>
                        </div>
                        <div style="margin-top: 10px; text-align: right;">
                             <button style="background:none; border:none; cursor:pointer;" onclick="toggleStatus(${todo.id})">
                                <i class="fas ${isDone ? 'fa-undo' : 'fa-check-circle'}"></i> 완료 처리
                             </button>
                        </div>
                    </div>
                `;
                todoList.appendChild(li);
            });
        }
    }

    function saveTodos() {
        try { localStorage.setItem('todos', JSON.stringify(todos)); } 
        catch (e) { alert('저장 용량 부족'); }
    }

    function exportToCSV() {
        if (todos.length === 0) return alert('데이터 없음');
        let csvContent = "\uFEFF날짜,D-Day,업무명,상태,로그일시,내용\n";
        todos.forEach(todo => {
            const dDayStr = todo.dueDate ? `마감:${todo.dueDate}` : '-';
            todo.logs.forEach(log => {
                csvContent += `${todo.logs[0].date},${dDayStr},${todo.title},${todo.status},${log.date},${(log.note||"").replace(/,/g," ")}\n`;
            });
        });
        const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "업무일지.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});
